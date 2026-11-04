# 284 -- The plant zone's marking: the bases' `*_pulse` outlines (PB-9)

- Date: 2026-10-11. PB-9's read (the playtest batch 2 plan's row, taken by PARITY-2's lane; [brief](../plans/briefs/2026-10-11-pb9-plant-zone-marking-read.md);
  issue #121 (closed); HUMAN_TASKS H164). Base `d4e258e98` on `agent/pb9read`.
- Status: **reading** -- re-read at the source by a fresh reviewer 2026-10-11 (PASS WITH FINDINGS, high: MP72 in full,
  MP1, MP61 re-derived, MP73 and MP83 in part, eight decompilation sites; its three wording findings folded in). The disc's data was read through the repository's readers (`parseSceneGraph`,
  `placeInstances`, `placeCollision`, `readMapMeta`, `loadModelLibrary` with `walkChain` / `interpretChainPartsAs`,
  `parseTextureRecord` / `decodeTexture`, `parseAnimSets` / `decodeEffectProgram`). Three throwaway probes
  (`tools/zz-*.ts`, not committed) read every map that holds `BombPlace` on the dev disc
  (`SOCOM_DISC=C:/Projects/socom_pc/game/disc`, `RUN/MP<N>.ZDB`). The decompilation
  (`$SOCOM_PC_ROOT/game/analysis/socom2_game.elf.decomp.c`) was read at the sites cited `FUN_<addr>` and `D:L<line>`.
  Two string addresses were read from `socom2_game.elf` through its program headers. Nothing was measured running: no
  game, capture, browser, build or server was run. No source changed.
- Evidence kinds, kept apart: disc data through the readers (§1 to §4); decompilation source inspection (§3, §4);
  the port's source read (§6). No capture, no playtest.

**In one line:** the marking is real map geometry. Each base holds one flat outline round its tent's plant zone:
`terrorist_pulse` (texture `base_red.tif`) and `seal_pulse` (`base_green.tif`). zAnim's initial state hides both
(node reference bit 31). The map's own `objectives` script turns one on when the bomb is picked up: the outline at
the **carrier's target**. A SEAL carrier lights the Terrorists' red outline, and a Terrorist carrier the SEALs' green
one. It is drawn faint and pulsing: the node's opacity runs from 0.2 down to 0.05 in 1 s and back to 0.2 in 0.2 s,
for as long as the bomb stays picked up. A drop turns it off. Nothing tests the player's team, so every console draws it.

## 1. What the marking is

- **The node.** Each DEMOLITION base model holds one child named `<side>_pulse`, a sibling of the base's `healthy`,
  `whats_left` and `parts`. On MP72 these are `worldmodel/terrorist_base/crates_weapons=crates_weapons/terrorist_pulse`
  and `worldmodel/seal_base/crates_hospital=crates_hospital/seal_pulse`. The node's own flag word is 0x80040051 (bit
  0, active, set). There is one visual: `vparams` 0x8800b, material 0.
- **The mesh.** 56 vertices and 32 triangles: a flat band (zero height extent) shaped as a rounded rectangle. Its
  middle is empty. Along the two lines through the band's centre the triangles cover only two intervals 6 to 10 u wide
  (MP72 `terrorist_pulse`: x from 34.5 to 44.25 u either side of the centre, z from 28.75 to 38.5 u). So it is an
  **outline**, not a filled patch. The vertex colours are white with alpha 1, and the UVs run from -4 to 1.
- **Where it lies.** It is round the tent's plant quad, but not in one fixed relation to the quad's edge. MP72's
  `terrorist_tent` quad runs x 487.34 to 564.71 and z 1492.00 to 1558.98 at y 14.31; its band covers x 481.77 to 570.34
  and z 1487.09 to 1564.52 at y 14.31, so it straddles the edge, about 4 u inside and 5.6 u outside. MP72's
  `seal_pulse` lies wholly **outside** `seal_tent`'s quad (its inner edge 25.6 / 26.9 u from the centre against the
  quad's half-widths 22.0 / 25.1: a gap of about 1.7 to 3.6 u all round), and on MP73 the band's +z side lies wholly
  **inside** the quad (its outer edge 0.16 u in). A player standing on the band is not necessarily in the plant zone;
  the zone is the quad, the band is only drawn round it (the review's finding 1).
- **The floor.** The band lies on the floor, within about 2 u. Sampled at every triangle's centre (the review's finding
  2; the author's first read sampled four points a band): MP72's `seal_pulse` sits 1.0 to 2.06 u above the highest
  collision polygon (`placeCollision`); two of MP72's `terrorist_pulse` triangles sit 0.32 / 0.48 u under a polygon;
  MP83's `seal_pulse` and `terrorist_pulse` each sit about 0.15 to 0.17 u under their tent quads at points. The draw
  (additive, the alpha pass) is unaffected; a build draws the node where the map places it.
- **Its texture.** On the six DEMOLITION maps, `base_red.tif` and `base_green.tif` are 16 x 16 PSMT8 textures in the
  map's own `MP<N>_TXR.ZED`. Decoded, `base_red` has mean RGBA (160, 30, 30, 251) and maximum (255, 107, 107, 253).
  `base_green` has mean (86, 160, 30, 251) and maximum (171, 255, 107, 253). Both bind packets set the **additive**
  blend (`gs.blend` `additive`: `(Cs - 0) * As + Cd`). It is a soft colour added onto the floor.
- **The alpha pass.** `vparams` bit 0 is set and bit 8 is clear, so the visual is drawn in the engine's alpha pass
  (`visualInAlphaPass`, `@s2u/scene` `sceneGraph.ts`). A node whose opacity is under 1 goes there anyway:
  `FUN_003374c0` reads the opacity stack's top (D:L235394), draws in the walk only at 1.0 or above (D:L235424), and
  above 1/128 hands the visual to the alpha list (`FUN_003371b0`, D:L235437-235438).

**One outline a tent, one colour each.** No base holds a second outline, a second mesh or a second texture for its
marking. The colour does not change with the state: red is the Terrorist base's, green the SEALs' (the coordinator's
hypothesis of a state-dependent colour is not borne out by the data). The red of the original's frame (issue #121 (closed): "a
dark-red floor tint around a SEAL carrying the satchel") is what this reading predicts there. A SEAL carrier lights
`terrorist_pulse`, which is red, and at an opacity of 0.05 to 0.2 an additive `base_red` adds at most about 0.2 x
(255, 107, 107) to the floor: a dark red. The bright green glow the owner saw in the port's old viewer is
`seal_pulse` drawn by the "alternate states" toggle at full opacity (§6). That green is the port's draw of the
texture, not the original's look. How the opacity enters the draw is not read (`BASE_PULSE_DRAW_READING`, §7).

## 2. MP72: every node hidden at the start over or near the plant zones

Every placement (`placeInstances`) whose origin lies within 80 u of a tent's quad and that the port's rule
(`loadMap.ts` `place`) hides at the start. 363 placements, 73 hidden on the map; 34 of them near the tents, 17 a tent:

| node (under `worldmodel/<side>_base/<base>=<base>/`) | count | geometry | on the floor | hidden by |
|---|---:|---|---|---|
| `terrorist_pulse` / `seal_pulse` | 1 + 1 | the outline (§1); `base_red.tif` / `base_green.tif` | yes: flat, y 14.31 / 63.69 | zAnim's initial state: the reference `terrorist_pulse` / `seal_pulse` of `pulse_terrorist` / `pulse_seal`, word 0x90080300 (bit 31 deactivate, bit 28 save active) |
| `parts/part1` .. `part15` | 15 + 15 | the base's flying debris (`crate_wood01`, `metallight`, `crate_medical`, `tent_top`) | no: y 13.4 to 33.1 (terrorist), 68.3 to 111.8 (SEAL) | zAnim's initial state (`parts`, of `destroy_<side>_base`) |
| `whats_left` | 1 + 1 | the wrecked base (wood, crates, the tent's remains) | no: y 13.19 to 26.25 / 63.19 to 92.25 | zAnim's initial state (`whats_left`, of `destroy_<side>_base`) |

The name rule hides none of them. `ALTERNATE_STATE` (`loadMap.ts:1124`) would match `_pulse`, `parts` and
`whats_left`. But zAnim names each of those paths, so `hiddenByRule` exempts them (`named`, `loadMap.ts:1149-1153`).
The `off` list (zAnim's bit 31, `loadMap.ts:1148`, `:1156`) is what hides them. The brief's lead named the name
rule (`hiddenByName`, `:1139`). That line only feeds the `alternateDisagreement` diagnostic. The map's opening
state, read through zAnim, is the rule that hides the outline. The `parts` and `whats_left` are XR-08's base
destruction on a detonation (`destroy_<side>_base`: `healthy` off, `whats_left` and `parts` on). That program does
not name the outline, so a detonation leaves it as it was.

## 3. What turns it on, and when

**The programs** (`MZANIM.ZAR`, set `mission`; byte for byte the same on every map that holds them, §5).
`pulse_terrorist` has root `terrorist_base` (search 0) and references `terrorist_pulse` (search 1, word 0x90080300).
`pulse_seal` is the same with `seal_base` and `seal_pulse`. `Anim_Params` flags 0x32: `& 3` = 2, so it does not start
with its set. Its sequence offsets are (0, 0, 0, 100), so the cleanup sequence is at byte 100.

| sequence | word | commands |
|---|---|---|
| byte 0 | 0x102 (activation 1: runs at the start) | `OBJECT_ACTIVE_STATE` the pulse node **on**; `WHILE` forever: `OBJECT_OPACITY_FROM_TO` the node 0.2 -> 0.05, rate -0.15 a second, 1.0 s; `OBJECT_OPACITY_FROM_TO` 0.05 -> 0.2, rate 0.75 a second, 0.2 s; `END_WHILE` |
| byte 100 (`Anim_Params` cleanup) | 0x104 | `OBJECT_ACTIVE_STATE` the pulse node **off** |

The opacity commands' bytes are `19 00 60 00 02 00 00 00 | cd cc 4c 3e | cd cc 4c 3d | 9a 99 19 be | 00 00 80 3f` and
`... | cd cc 4c 3d | cd cc 4c 3e | 00 00 40 3f | cd cc 4c 3e`. That is node 2 (the pulse reference), then from, to,
rate and time at +8, +0xc, +0x10 and +0x14, laid out as `FUN_0025f960` reads them. `decodeEffectProgram` leaves them
as `other` (cmd 25, `OBJECT_OPACITY_FROM_TO`). One cycle is 1.2 s, and the opacity never reaches 0 or 1.

**What each command does in the original:**
- `OBJECT_OPACITY_FROM_TO`: the begin `FUN_0025f960` (D:L108835-108847) writes `from` into the node's opacity
  (+0x9c). The tick `FUN_0025f880` (D:L108804-108832) adds rate x dt until the time is spent, then writes `to`.
  Research 141 R141.12 read the same pair for the menus.
- `CALL_ANIMATION`: `FUN_0025d5c0` (D:L107485ff).
- `STOP_ANIMATION`: `FUN_0025d490` (D:L107435-107462) ends the instance through `FUN_002707c0` (D:L118829ff), which
  calls `FUN_0026ff20(instance, 5)` (D:L118878). An instance's end runs its cleanup sequence, the `Anim_Params` offset
  at +0x16, through `FUN_0026d870` (D:L118599). That is the `OBJECT_ACTIVE_STATE` off above.
- **At the map's load** (`FUN_0026b5e0`): a reference with bit 31 has its node deactivated (D:L115744-115745), and
  bit 28 saves the node's active state for the round's reset (D:L115747-115751).
- **At the round's reset** (`FUN_002232a0`, D:L75851-75866): both sets are stopped (`FUN_0026c2e0`), the saved
  references are restored (`FUN_0026c4f0` -> `FUN_0026b430`, D:L116280-116285) and the sets are started again
  (`FUN_0026c600`). The valves are then cleared (`FUN_002b5510`, D:L75868). So every round opens with both outlines
  off and no pulse running.

**Who calls them: the map's `objectives` script** (`objectives`, set `mission`, flags 0x21, starts with its set).
Research 213 §2.4 transcribed it on MP72. It is re-read here on all nine maps (§5); the decoded op lists are equal
up to the message ids.

| sequence (MP72 offset) | activation | body |
|---|---|---|
| `bomb_pickup` (@4344) | 1 (at the start) | `WHILE` forever: `IF mp_bomb == 2`: `MUS_BOMB_PU`, 7207, 7212; `IF bomb_owner == 1`: **`CALL_ANIMATION pulse_terrorist`** (@4492); `ELSEIF bomb_owner == 2`: **`CALL_ANIMATION pulse_seal`** (@4536); `ENDIF`; `CALL_SEQUENCE bomb_drop`; `STOP_SEQUENCE bomb_pickup` |
| `bomb_drop` (@4204) | 2 (called) | `WHILE` forever: `IF mp_bomb == 1`: 7207, 7211; **`STOP_ANIMATION pulse_terrorist`**; **`STOP_ANIMATION pulse_seal`**; `CALL_SEQUENCE bomb_pickup`; `STOP_SEQUENCE bomb_drop` |

No other sequence of `objectives`, and no other animation on any of the nine maps, names a pulse (the probe searched
every sequence's decoded ops and every animation's name table).

**The valves.** `mp_bomb` and `bomb_owner` are made by `FUN_002c1a80`, from the strings at 0x3f2928 (`mp_bomb`, D:L163865)
and 0x3f2930 (`bomb_owner`, D:L163872). Both strings were read off the ELF. `FUN_002c1c30` writes them on every
state change:
- `mp_bomb` takes the new state (D:L163966-163975).
- `bomb_owner` takes the state's actor's side. For state 2 that actor is the carrier (D:L163950-163953): 2 when
  `FUN_002c30b0(actor)` holds, else 1 (D:L163986-163996). Research 171 §6 reads 1 as the SEALs and 2 as the
  Terrorists. The script agrees: its `defuse` and `bomb_timer` branches pair `bomb_owner == 1` with the SEAL viewer
  (`player_team == 0`) for the SEALs' win (research 213 §2.4).
- On state 1 (on the ground), `bomb_owner` is cleared to 0 (D:L163964, D:L163979-163984).

`FUN_002c1c30` runs on the host from `FUN_002c20c0` (D:L164081-164082). On every other console it runs from the
replicated bomb object's state (`FUN_002c23b0`, D:L164156-164158). So every console's `objectives` sees the same
`mp_bomb` and `bomb_owner`.

**So, the switch and its condition:**
- **On:** the bomb's state becomes 2 (picked up). `bomb_owner` 1 (a SEAL carries) starts `pulse_terrorist`: the red
  outline at `terrorist_tent`, the SEALs' plant site (`plantSite`, research 214 §1). `bomb_owner` 2 (a Terrorist
  carries) starts `pulse_seal`: the green outline at `seal_tent`. The outline marks **where the carrier must plant**.
- **Off:** the bomb's state becomes 1 (a drop: a death, a leave or the manual drop). Both programs are stopped and
  their cleanup hides the node. The next pickup lights the outline for the new carrier's side.
- **Planted, defused, detonated:** nothing stops it. The script waits for `mp_bomb == 1`, which never follows state
  3. The outline keeps pulsing through the plant, the fuse and the result, until the round's reset (above). XR-08's
  base destruction does not touch it (§2).
- **Who sees it:** every player, both teams and a spectator alike. No branch tests `player_team`, the script runs on
  every console, and its valves are replicated. The satchel's carrier is not singled out.

## 4. The plant itself

The plant (`BombPlace`, research 214 §8-§9) neither starts nor stops the outline. `BombPlace` names no node and no
other animation. The outline's state is only the pickup's and the drop's.

## 5. The nine maps that hold `BombPlace`

| map (mode) | outlines (path under `worldmodel/`) | textures (blend) | band (along x / z through its centre) | `pulse_*` programs |
|---|---|---|---|---|
| MP1 (Demolition) | `terrorist_base/tnt_dredge_group=tnt_dredge_group/terrorist_pulse`, `seal_base/tnt_comshack_group=tnt_comshack_group/seal_pulse` | red, green (additive) | 16.25-23.5 / 16.25-23.5; 15.25-22.75 / 15.25-22.5 | both |
| MP7 (Demolition) | `terrorist_base/tent_terrorists=tent_terrorists/terrorist_pulse`, `seal_base/tent_seals=tent_seals/seal_pulse` | red, green (additive) | 20-28 / 21-28.75; 24.25-31.5 / 23.5-31.5 | both |
| MP9 (Demolition) | `terrorist_base/tnt_depot_group=tnt_depot_group/terrorist_pulse`, `seal_base/tnt_shack_group=tnt_shack_group/seal_pulse` | red, green (additive) | 23.75-29.5 / 23-28.75; 19.75-25.25 / 14.5-19.75 | both |
| MP12 (Demolition) | `terrorist_base/mpbase_terr=mpbase_terr/terrorist_pulse`, `seal_base/mpbase_seal=mpbase_seal/seal_pulse` | red, green (additive) | 29.5-39.25 / 31-40.75; 39.75-49.5 / 37-46.75 | both |
| MP72 (Demolition) | `terrorist_base/crates_weapons=crates_weapons/terrorist_pulse`, `seal_base/crates_hospital=crates_hospital/seal_pulse` | red, green (additive) | 34.5-44.25 / 28.75-38.5; 25.75-34.75 / 27-36 | both |
| MP83 (Demolition) | `terrorist_base/terrorbase=terrorbase/terrorist_pulse`, `seal_base/sealbase=sealbase/seal_pulse` | red, green (additive) | 36.75-44 / 9-16.25; the same | both |
| MP61 (Breach) | `terrorist_base/terr_mpbase=terr_mpbase/terrorist_pulse` only | red (32-bit, source alpha) | 19-28.75 / 34.5-44.25 | `pulse_terrorist` only |
| MP62 (Breach) | `terrorist_base/crates_weapons=crates_weapons/terrorist_pulse` only | red (32-bit, source alpha) | 28.75-38.5 / 34.5-44.25 | `pulse_terrorist` only |
| MP73 (Breach) | `terrorist_base/terrorist_pulse` only (a child of the base node itself, flags 0x808000f1) | red (8-bit, source alpha; mean alpha 109) | 10.75-20.75 / 15-25 | `pulse_terrorist` only |

- **Every Demolition map has one outline a tent**, two a map. Each is hidden by zAnim's initial state (word
  0x90080300), and each is round its tent's quad. The two textures decode to the same mean and maximum RGBA on all six (the pixels themselves were not compared). The
  outline meshes all have 56 vertices and 32 triangles.
- **The three Breach maps** (research 172, 174) have one tent, `terrorist_tent`, and one outline, `terrorist_pulse`.
  They have no `seal_tent` and no `seal_pulse`. Their `base_red.tif` is a different texture with a source-alpha
  blend, and MP73's alpha is graded.
- **Every map's `objectives`** holds the same `bomb_pickup` / `bomb_drop` (only the message ids differ: 72xx, 73xx
  on MP73, 83xx on MP83). On a Breach map, a `bomb_owner == 2` pickup would call a `pulse_seal` the set does not
  hold. What `CALL_ANIMATION` does with a missing name is not read here. It does not matter if Terrorists never carry
  on Breach (research 174's bomb restrictions).
- **No map that holds `BombPlace` lacks the outline.** MP52's stray `BombPlace` (research 214 §8) has no MPBOMB
  record and was not surveyed.

## 6. The port today

- `loadMap` marks both outlines `alternate` (zAnim's bit 31, §2), and `WorldState.applyInitial` keeps them off.
  Nothing turns them on: `RoundCues.bomb` reads `bomb_pickup`'s branches and drops its `CALL`s on purpose
  (`roundCues.ts:124-125`, "the base's pulse ... are no cues"; research 214 §3). No page runs `pulse_*`.
- `WorldView.setAlternate(true)` (`world.ts:112`) draws every alternate placement whatever the world's state. It draws
  them at the draw's own opacity, not the program's 0.05 to 0.2. That is what the owner saw: a bright green outline
  round the SEALs' tent (`seal_pulse`). The red one was at the Terrorists' tent, out of his frame.
- The scene runner (`effectRunner.ts` `EffectRun`) has no opacity op: `decodeEffectProgram` leaves
  `OBJECT_OPACITY_FROM_TO` as `other`. `WorldView` has no per-node opacity: `setNodeActive` is on/off only, and the
  only opacity it draws is the LOD fades.
- Issue #121 and PB-9's row say the tent zones carry "no visual". That is right of the `*_tent` nodes, which are one
  collision quad each. The marking is their base's sibling node, which that disc read did not open.

## 7. Readings and placeholders

PB-9b (§8) brought the first two in as constants, 2026-10-12 (reading, pending review); the third stays a note (no
constant): the code draws nothing for a program the set lacks, and PB-9b's fix round (2026-10-12) names it in
`WorldState.runDisplay`'s comment.

| name | what it stands for | evidence that settles it | status |
|---|---|---|---|
| `BASE_PULSE_DRAW_READING` | how a node opacity f under 1 scales an alpha-pass visual's draw. Read as the blend's alpha `As` x f (additive: `Cs x As x f + Cd`). Not traced: `FUN_003371b0` stores the visual into the alpha list and the opacity's use in the list's draw (`FUN_003b6b20`, D:L308264ff) is unread | the trace of `FUN_003b6b20`'s use of the opacity, or a capture of the outline (H164) | in code: viewer `world.ts` (`'alpha-times-opacity'`; `WorldView.setNodeOpacity` through the LOD fades' twin, `./lodFade`'s `alpha` mode), PB-9b; reading, pending review |
| `BASE_PULSE_JOIN_READING` | a player who joins while the bomb is carried. Read as: his `objectives` starts with the round, finds `mp_bomb == 2` at once and lights the outline for `bomb_owner` (also playing `MUS_BOMB_PU` and 7212). The join's replay of the bomb state before the script's first tick is not traced | a trace of a joiner's first frames on a live round, or a capture | in code: viewer `bombPage.ts` (`'welcome-carried'`: a welcome into state 2 lights the carrier's target, any other state none), PB-9b; reading, pending review |
| `BASE_PULSE_MISSING_CALL_READING` | a Breach map's `bomb_owner == 2` pickup calling the absent `pulse_seal`. Read as: nothing drawn (`FUN_0025d5c0`'s lookup not read) | `FUN_0025d5c0`'s miss path; research 174's who may carry | note only; named in viewer `worldState.ts` `runDisplay`'s comment (PB-9b's fix round) |

The colour is not an unknown: it is the texture's (§1). The capture confirms it and does not decide it.

## 8. Proposed build row (for the controller)

**PB-9b -- the bases' pulse outlines on both pages** (the original's `pulse_terrorist` / `pulse_seal`, run from the
bomb's state; issue #121 (closed)).

- **Data.**
  - `@s2u/scene` `effects.ts` decodes `OBJECT_OPACITY_FROM_TO` (set 0, cmd 25) as
    `{ op: 'opacity', node, from, to, rate, seconds }`, at the offsets `FUN_0025f960` reads.
  - `EffectRun` ticks it as `FUN_0025f880` does: `from` at the begin; rate x dt each tick; `to` when its time is
    spent, with the remainder of dt carried. That is `@s2u/ui` `zanimRuntime.ts`'s handler (research 141 R141.12).
  - Stopping a run executes its cleanup sequence (`seqOffsets[3]`, `FUN_0026d870` at D:L118599), if `EffectRun`
    does not already.
- **World.**
  - `WorldHooks` gains `opacity(path, f)`; `WorldView` gains `setNodeOpacity(path, f)`.
  - The draw follows the alpha pass at its texture's blend, scaled by f (`BASE_PULSE_DRAW_READING`).
  - `WorldState.reset` leaves both outlines off, as the saved bit-28 state gives.
- **Trigger.** It is data-driven, not hard-coded.
  - `roundCues` keeps, with the `pickup` cue, `bomb_pickup`'s `CALL_ANIMATION` per side (1 -> `pulse_terrorist`,
    2 -> `pulse_seal`), and with `drop`, `bomb_drop`'s `STOP_ANIMATION`s.
  - The page's bomb follower (`bombPage.ts`) runs the named program on a live state 2 for the carrier's side, through
    the page world's `runProgram`, and stops both on state 1.
  - A joiner's welcome with state 2 (carried) lights it as the pickup would (`BASE_PULSE_JOIN_READING`).
  - It is presentation only: the room's world runs nothing (`ROOM_SKIP_EFFECTS_READING`).
- **Both pages.** `/testroom` (`main.ts`'s page world) and the match (`matchMount.ts` through `matchWorld.ts` /
  `bombPage.ts`).
- **RED** (each failing before the change):
  1. A fixture test on MP72 (`test-fixtures/RUN/MP72.ZDB`). `decodeEffectProgram(pulse_terrorist)` yields `active`
     on, then a forever `WHILE` of `opacity` 0.2 -> 0.05 / 1.0 s and 0.05 -> 0.2 / 0.2 s, then the cleanup `active`
     off. Today it yields `other`.
  2. A unit test of the page world on MP72's meta. A SEAL pickup (state 2, `bomb_owner` 1) draws `terrorist_pulse`'s
     path and leaves `seal_pulse` off. The opacity is 0.2 at t 0, 0.125 at 0.5 s, 0.05 at 1.0 s, 0.2 at 1.2 s, and
     so on. A drop (state 1) hides it. A plant (3), a defuse (4) and a detonation (5) keep it. The round's reset hides
     it. A Terrorist pickup draws `seal_pulse`.
  3. A wiring test on each page: the `bomb` event reaches `setNodeActive` / `setNodeOpacity` with those paths.
  4. A dev-disc test over the nine maps: each Demolition map's two outlines and each Breach map's one, the init word
     0x90080300, and `objectives`' calls.
- **Acceptance.**
  - The four tests are green, and the gate's record is quoted.
  - The owner's playtest on `main`, on Crossroads: a SEAL pickup lights a faint red pulsing outline round the
    Terrorists' tent; a drop puts it out; it stays through the plant.
  - H164's capture confirms the look.
- **Departs from PB-9's row** (the playtest batch 2 plan, `:42`: "built on both pages from the tent's quad", written when
  the earlier disc read found no visual; it cites PB2.R3 only for "both pages"). The original draws its own geometry,
  so the build uses the outline node and not the quad. **Ruled** 2026-10-11 as PB2.R5 (the main merge controller under
  the owner's mandate): the marking is the original's own node; PB2.R3 (both matches) and PB2.R4 (read first; never the
  debug overlay) stand.

**What H164's capture would then only confirm** (it no longer decides whether a marking exists):
- **The look.** The outline's colour at its pulse (expect a dark red for a SEAL carrier and a dark green for a
  Terrorist carrier, additive and faint), its 1.2 s cycle, its shape round the tent. This settles
  `BASE_PULSE_DRAW_READING`.
- **Who sees it.** Expect the same on the carrier's, a teammate's and an enemy's screen.
- **When.** On from the pickup's frame, off from a drop's, on through the plant to the round's end. A joiner
  mid-carry would settle `BASE_PULSE_JOIN_READING`.
