# 440 -- C4 takes the aim's opaque record: a pane, a fence or a net is looked through (LATER 276)

- Date: 2026-11-16. Branch `agent/wm-swap-c4glass`, base `origin/agent/next` e727e644b2. The bugs intake's item 1
  after v0.4.23 (the owner: "fish hook you can c4 windows (we noticed this before but could not identify what
  prevented them from being placable on them ...)"); answers LATER 276.
- Track: simulation. Status: **reading, pending review** -- source inspection of the r0001 decompilation
  (`socom2_game.elf.decomp.c`, cited `FUN_<addr>` and `D:L<line>`) and of the disc through the repository's readers.
  A fresh reviewer's re-read at the source is owed. **Nothing here is measured on the original running.**
- Evidence kinds, kept apart: **(D)** source inspection of the decompilation; **(S)** the disc read through the
  repository's readers (`materials.rdr` SOILS: `scene/src/projectile.ts` `SOILS`, checked against the file by its
  test; the maps through `loadSimMap`); **(P)** source inspection of the port; **(O)** the original running -- one
  manual check relayed by the owner on 2026-10-22 (LATER 276: planting on the tested window was not possible), not a
  capture and not scored.
- New names (section 5): `c4AimPick` and `actionLine` (`viewer/src/equipment.ts`), functions, and one reading,
  `C4_THROUGH_REACH_READING` (section 7; retired by section 8). Section 8 (LATER 1139) adds `C4_HIP_REACH_SQ` (proven),
  `hipPoint` and the reading `C4_HIP_POINT_READING`, and retires `C4_REACH_READING` with it. No `*_PLACEHOLDER` is added
  or changed.

## 0. The answers

1. **The original's C4 target is the aim ray's opaque record** (D; section 1). `FUN_005aa6e0` keeps two records
   per frame: the opaque record (`body+0x3c0`..`+0x3dc`: point, surface, normal, node), which is the nearest hit the
   material rule keeps, and the action record (`+0x3e0`..`+0x3fc`). The C4 settle, the plant's start and the plant's
   callback read only the opaque record. So C4 never reads the action record.
2. **A pane is never C4's target** (D, S; section 2). The material rule passes over a hit whose material is
   VOLUMETRIC, LIQUID or of `PENETRATION` >= 0.98 without PICKUP. GLASS (0.99), GLASS_MEDIUM (0.985),
   METAL_GRATE_THIN (0.985), CAMO_NET (0.98) and CHAINLINK_FENCE (0.98) are all looked through. A surface the aim
   looks through is never the aimed object, so it is never asked whether it accepts a charge.
3. **What lies behind one can be** (D; section 3). Neither the plant's start nor its callback tests a line from the
   head or the body to the point. The only tests are: the opaque record's node accepts the charge, the point within
   the hip's reach (`body+0x208 < 396`), the settle run down, and the callback's own material checks. So a
   destructible seen through a pane, a fence or a net, nearer than anything kept on the ray and within reach, is
   planted on, at the opaque record's point. The charge goes on the surface behind and nothing sits on the glass.
   No glass needs to break first. **Whether a real map offers such a place** within reach is section 4's sweep.
4. **The port differs on both sides** (P; section 3). The page picks C4's surface with `aimPick`: the first face
   that the movement does not skip, with no material rule. So a pane that takes the charge (Frostfire's `pane1`,
   shield 0, research 210 section 6) is planted on. The room's `c4Line` counts every face before the point as a wall,
   panes included, so it refuses a target behind glass (`c4 walled`) that the original would take.
5. **The change** (section 5, ruled by the main controller): the page picks on the opaque record (`c4AimPick`), the
   room's `c4Line` passes over what the aim looks through, the switch press keeps the old line (`actionLine`), and a
   plant reached through a looked-through face is taken only inside the original's read reach,
   `C4_THROUGH_REACH_READING` (19.9 u; section 5, item 4). Of the C4 targets on the disc, 21 panes and bottles are no
   longer plantable; the 10 mixed keep a kept face (section 4).

## 1. The two records and who reads them (D)

- `FUN_005aa6e0` (the camera's aim ray; research 84 section 19, 179 section 11) walks the query's hits
  (D:L464126-464199). For each one, D:L464145-464160 decide whether it is kept: an empty material slot is not kept;
  a surface whose `m_cameratype` nibble is 1 is not kept; otherwise it is kept unless its material's flags
  (`+0x3c`) have bit 0 (VOLUMETRIC) or bit 1 (LIQUID), or its `PENETRATION` (`+0x24`) is >= 0.98 with bit 4 (PICKUP)
  clear (D:L464149-464151). The nearest kept hit by squared distance is the opaque record
  (D:L464162-464170). A hit that is not kept is tested for an action node (D:L464171-464195).
- The opaque record is written at D:L464272-464290 (`+0x3c0`..`+0x3dc`; `pfVar14[7]`, the hit's node, at `+0x3dc`),
  or cleared to none at D:L464259-464271. The action record is written at D:L464291-464314.
- **The settle**, `FUN_005be6f0`, reads the opaque record's node from `body+0x3dc` (D:L475130-475138). It restarts
  the 0.2 s clock whenever that node is none, another node, not plantable (its `+0x94` interface's vtable `+0x10`) or
  moved since the last frame (D:L475139-475197; research 210 section 9).
- **The plant's start**, `FUN_005be9a0` (the C4 branch, `cVar4 == -0x69`), reads the node again from `+0x3dc`
  (D:L475380). It asks that node's `+0x94` interface whether it takes the charge (D:L475387-475388; `FUN_002739b0`,
  research 210 section 9) and takes the point from `FUN_005aa6d0` (`return body + 0x3c0`; D:L475399). It
  requires `body+0x208 < 396` and the settle at 0 (`body+0xe84`) (D:L475400-475405), then saves the record whole
  (`DAT_0066b680`..`DAT_0066b69c`, the node at `DAT_0066b6a0`; D:L475406-475419) and starts action 0x3e.
- **The callback**, `FUN_005c1970` (item 0x97), works on the saved record (D:L476905-476985). It asks the saved node
  again whether it takes the charge and whether it has stayed where it was (D:L476905-476940). It refuses material
  index 1, `PARTICLE_SYSTEM` (D:L476966-476974), and the name at 0x65f8c8, `INVISIBLE_DI` (D:L476975-476977; research
  210 section 9). It sets the charge down only when the material's bits 0 and 1 are both clear (D:L476979-476985).
- No line from the head, the hip or the camera to the point is tested anywhere in that path (D:L475379-475453,
  D:L476905-476985: read through; the only geometric tests are the reach and the settle's "moved").

## 2. The materials the aim looks through (S)

From `materials.rdr`'s SOILS (`scene/src/projectile.ts` `SOILS`), applying section 1's rule. A material is looked
through if it is VOLUMETRIC, LIQUID, or has `PENETRATION` >= 0.98 without PICKUP:

| looked through | why |
|---|---|
| `ACTION` (1), `INVISIBLE_DI` (1) | `PENETRATION` >= 0.98, no PICKUP |
| `GLASS` (0.99), `GLASS_MEDIUM` (0.985), `METAL_GRATE_THIN` (0.985), `CAMO_NET` (0.98), `CHAINLINK_FENCE` (0.98) | the same |
| `WATER` | LIQUID |
| `LEAFY_TREE`, `GRASS_VOL`, `BUSH_VOL`, `SNOWY_GRASS_VOL`; built-in `PARTICLE_SYSTEM` | VOLUMETRIC |

Kept: everything else, including `ITEM` (1, PICKUP), `PERSON` (0.97), `METAL_RAILING` (0.95), `GLASS_THICK` (0),
`GLASS_OPAQUE` (0) and `BROKEN GLASS` (0).

A consequence the port has not drawn: `INVISIBLE_DI` is itself looked through by the aim. So the callback's name test
(section 1) can match only a saved record whose material reads `INVISIBLE_DI` at the callback and did not at the aim.
On an unchanged surface that is never.

## 3. What the port does today (P)

- **Page** (`viewer/src/grenade.ts` `c4Pick`, `c4Now`, `c4Tick`): `aimPick(grid, eye, far, defaultMaterial)`
  (`viewer/src/equipment.ts`), the first surface along the view whose surface word lacks `SURFACE_SKIP`, with no
  material rule, no front-face rule and no `m_cameratype` rule. Its comment calls this "C4's opaque aim point
  (`+0x3dc`)", but it does not apply the opaque record's rule.
- **The port's opaque record already exists**: `actionRayDetail` (`viewer/src/equipment.ts`) applies the eye query's
  admission (`aimQueryAdmits(p, 'eye')`), the front-face and first-face-per-owner rules of `FUN_002d2890`, and
  `aimHitKept` (`viewer/src/net/aimQuery.ts`; `aimPickBlocks`, `scene/src/projectile.ts`). It keeps the opaque hit,
  but returns it only as the fallback of `.pick` (an action hit nearer than it wins). Its `opaquePath` names the node
  but not the point or the polygon.
- **Room** (`match/src/room.ts` `placeCharge`, the C4 branch): `c4TargetAt(surface.path)`, `c4InReach`, then `c4Line`
  (`viewer/src/equipment.ts`). `c4Line` returns `walled` on any face of another node before the point, and its
  `firstAtPoint` takes the first face of the named node along each eye's line, both with no material rule. The
  material it reports is the named node's face at the point, refused only when it is `INVISIBLE_DI`.
- `c4Line`'s head line has no original: it is the port's guard against a page naming a surface it could not have
  aimed at (PF-05, LATER 121, 139, 144). Because the room does not see the page's view, it is kept. Its walls must not
  include what the original's aim looks through, or it refuses what the original takes.

## 4. The disc: which C4 targets carry looked-through surfaces (S)

The sweep: a throwaway dev-disc test on `agent/wm-swap-c4sweep` efc31c29ae (never merged), run on a box with the disc
(record `box/wm-swap-c4sweep-efc31c29a/keep/c4-sweep.txt`, sha256 c5656d1a04b7..., exit 0). For every MP map, every
destructible that takes C4's `Explosion_Damage` 18 (`SceneHealth.c4TargetAt`), its bound polygons split by section 1's
rule (`aimPickBlocks`, and `m_cameratype` 1 not kept). **Totals: 85 targets only kept faces, 10 mixed, 21 only
looked-through faces.** The looked-through materials on C4 targets: `GLASS` on 21, `INVISIBLE_DI` on 8, `SNOW`
(`m_cameratype` 1) on 2.

**The 21 no longer plantable (the original's aim looks through them)** -- every one a pane or a bottle, all `GLASS`,
none an access barrier or a bomb target:

| map | object (target path) | faces |
|---|---|---|
| MP2 | `door_slab` on `worldmodel/bdoor_4/door1=door1/door_slab/pane1`, `wdoor_1`, `wdoor_2` (3) | GLASS x2 each |
| MP6 | `beer1`..`beer7` (`worldmodel/beerN`) (7) | GLASS x12 each |
| MP6 | `beer8`, `beer9` (`worldmodel/beerN`, the `mp6_bottle` model) (2) | GLASS x8 each |
| MP71 | `wframe` on `worldmodel/h8wc1`, `h7wc2`, `h7wc3`, `h7wc4` `/window01=window01/wframe/wglass` (4) | GLASS x2 each |
| MP73 | `wglass` on `worldmodel/comm_hi/window02` (x2), `comm_low/window02` (x4), `b_hut61/window01` (x80), `special_windows/window04` (x4), `mywc20/window01` (x16) (5) | GLASS |

How each kind breaks in the original otherwise: MP2's panes take a rifle round (`door_slab`'s health block: health 1,
armour 0, shield 0, research 210 section 6 -- a reading of the disc, and the port's `fire` and `blast` break them). The
bottles' and MP71's and MP73's windows' health blocks are **unread here**: the sweep says only that each takes a charge
of 18 (health above 0, shield at most 18); whether a round or a blast breaks each is not read in this note.

**The 10 mixed keep a kept face** by material -- MP1 `outhouse1`,
`outhouse2` (WOOD_THIN, SNOW; SNOW `m_cameratype` 1 looked through); MP12 `tower_hitme`, MP6 `hit_crate07`, MP7
`sealtable1`, `sealtable2`, MP71 `access2`, MP73 `access1`, MP82 `access1`, `access2` (INVISIBLE_DI looked through).
**Not established** (the reviewer's finding 3): that the kept face is the face the page's pick meets from every side.
`c4AimPick` takes each owner's first front face in surface order (`FUN_002d2890`, section 3); an owner whose first
such face from one side is INVISIBLE_DI or SNOW (`m_cameratype` 1) offers no opaque hit from that side. The sweep counted
faces by material only; a geometric re-sweep would settle it.

**Places a charge may go on a target through a looked-through surface** (research 440 (a); candidates by geometry: a
visible looked-through face -- GLASS, GLASS_MEDIUM, METAL_GRATE_THIN, CAMO_NET, CHAINLINK_FENCE -- of another node whose
box comes within 32 u along the ground of the target's kept faces' box, heights overlapping; `gap` the ground gap):

| map | target | in front | gap (u) |
|---|---|---|---|
| MP11 | `access1`, `access2` (the top gates) | the gate's own chain (`.../gate/di_chain`, CHAINLINK_FENCE) | 0.0 |
| MP11 | `access1` / `access2` | the static fences (`stat_fence1`, `stat_fence2`, `statf_2`, CHAINLINK_FENCE) | 1.4 |
| MP6 | the table things: `ashtray`, `ashtray2`, `ashtray3`, `tincup1`..`6`, `plate1`..`4` | the bottles (`beerN`, GLASS) | 0.8 -- 12.3 |
| MP6 | `access1` | `beer8` (GLASS) | 16.5 |
| MP6 | `access1` | `beer3`, `beer4` (GLASS) | **20.2, 19.9: wider reach only** |
| MP73 | `kill_radio` | `special_windows/window04` (GLASS) | **25.6: wider reach only** |
| MP83 | `access1`, `access2` | `wc15`, `wc13` (CHAINLINK_FENCE) | **25.4, 26.4: wider reach only** |

(b) The original's reach is the hip's, `body+0x208 < 396` (19.9 u; section 1); the port's is `C4_REACH_READING`, 32 u
from the feet along the ground (research 202 s2.1, 210 s9.1). The five rows marked "wider reach only" would be planted
on through a pane or a fence only because the port's reach is wider. **Refused** by the main controller's ruling
(section 5, item 4): a through-face plant is held to `C4_THROUGH_REACH_READING`. The gap is a lower bound on the
feet-to-point distance of any such plant (the head's line crosses the pane between the feet and the point), so each of
the five is refused from every stand point; `c4GlassPick.test.ts` names each with its gap, and the within-reach rows as
taken at their gap (a stand point that near may not exist on the map).

## 5. The change (ruled by the main controller, 2026-11-16)

1. **The page** (`viewer/src/grenade.ts` `c4Pick`, which `c4Now` and `c4Tick` read): `c4AimPick`, the opaque hit of
   `actionRayDetail` with the map's material table (`surfaceMaterial`, byte 0 the map's `defaultMaterial`) -- the eye
   query's admission, front faces only, the first face per owner, `aimHitKept`. `ActionRayDetail` gains `opaque`, the
   opaque record itself whether or not an action hit wins `.pick`. Was `aimPick`.
2. **The room's C4 line** (`viewer/src/equipment.ts` `c4Line` and its `firstAtPoint`): a face the aim's material rule
   looks through (`materialThrough`, `aimPickBlocks`) is neither a wall nor the aimed face (items 4-5). The head line
   itself stays: it is the port's guard (section 3), not the original's.
3. **The switch press keeps today's line**: `actionLine` (the line without the opaque rule). A switch's named face is
   the action record's -- a hit the aim does not keep, on an action node (`FUN_005aa6e0` D:L464171-464194), such as an
   `ACTION` volume -- which the opaque rule would refuse. Pinned by `match/test/roomBarriers.test.ts` ("a switch whose
   named face is ACTION is still pressed"), red while the switch press called `c4Line`.

4. **A through-face plant is held to the original's read reach** (the main controller's ruling, 2026-11-16, a choice
   between readings logged for the owner): a plant whose target is reached through a face the aim looks through -- the
   behaviour this fix opens -- is taken only when the struck point is within `C4_THROUGH_REACH_READING` of the feet.
   **The measure**: the feet to the struck point along the ground, strict (`c4InReach`), the port's reach measure today;
   it stands in for the original's 3-D distance from `skel_root` to the aimed point, `body+0x208 < 396`
   (`FUN_005be9a0` D:L475400-475405; research 202 s2.1), until the hip gate is ported (LATER 1139). **What marks a plant
   through** (the controller's cure A): only a face the aim's MATERIAL rule looks through (`materialThrough`,
   `aimPickBlocks`: VOLUMETRIC, LIQUID, `PENETRATION` >= 0.98 without PICKUP), of another node, before the point on the
   room's line from the head (`c4Line`). In the room `placeCharge` drops a through plant beyond the reading
   `c4 reach`; every other plant keeps `C4_REACH_READING` (32). Why the original's number: where the fix creates
   behaviour, it is created at the original's own number, so the port moves toward the original in all 21 +
   through-face cases and away from it in none.
5. **Every other face is judged exactly as before C4-GLASS** (cure A): `c4Line` passes over only what the material
   rule looks through. A ground face with no side bit or a `m_cameratype` 2 face that the head's line crosses before
   the point is a wall, as it always was (`c4Line`'s filter passes bit 18 only), and a line that passes above one is
   clear: an ordinary plant at 20-32 u is taken or refused as today. (The first review's finding 1 had the room pass
   such faces like the page's eye query; that is withdrawn here: the page follows the room instead, item 6.) A named
   node's `INVISIBLE_DI` face within the slack is kept only when no other face of that node is, so a kept face behind
   an `INVISIBLE_DI` shell wins on both sides, and a page naming the shell itself is still refused by name ('c4 surface').
   **Census** (cure A's check; a throwaway dev-disc test, `agent/wm-swap-c4census` 6053e8409d, never merged; run on a
   box with the disc, record `box/wm-swap-c4census-6053e8409/keep/c4-census.txt`, sha256 ddcfcb07c5bf...): for every
   C4 target whose faces the aim all keeps, plants from stand points 20..31 u along the ground in front of each kept side
   face, both sides (head by `headEye(headPoint)` standing), judged today (the line before C4-GLASS, reach 32), on the
   head as first pushed (893873da11) and on this cure. **14,706 plants on 11 maps; today 4,545 taken. The cure changes
   0.** The head as first pushed changed **2,725 verdicts** (MP6 990, MP61 641, MP73 375, MP62 288, MP7 188, MP82 156,
   MP51 87) and, besides them, the reason of 1,233 refusals (walled -> `c4 reach`): the cure was needed (the author's
   expectation that it changed only reasons was wrong). On the cure 238 of those plants are `through` (a looked-through
   face before a solid target): walled today, refused beyond `C4_THROUGH_REACH_READING` now -- the same verdict.
6. **The page follows the room's head line** (cure B). The room judges from the head (`placeCharge`: `headEye` on
   `headPoint(startBody)`); the page has the same body (`WalkMode.startBody`, `GrenadeSource.startBody`, LATER 366's
   function) and asks the same line from the same head, with its camera's eye among the eyes as the room's are
   (`c4AimPick` with `head`): a line the room refuses (walled, missed) gives no target and no prompt, and the line's
   `through` marks the pick. Where the camera's line and the head's differ -- a pane the head's line crosses below the
   camera's, or one the camera's line crosses above the head's -- the page now answers as the room
   (`c4GlassPick.test.ts`, cures A and B, one worked case each way). Without a body (a page with none; the tests'
   `GrenadeThrower`) the camera's line alone decides `through` (`throughBefore`). Left as found: the page's pick drops
   back faces where the head's line counts another node's back face a wall -- now the head's line decides, so the page
   refuses with the room.

**The head-line guard is the port's, and the page now shows it** (the main controller, 2026-11-16; LATER 1140). The
room's line from the head to the struck point comes from ruling PF.R18 (2026-10-05, `docs/plans/2026-10-04-three-maps-and-feel.md`:
"the room validates eligibility, reach, the final surface's material and a clear head line -- the `useDoor` split, 92
s4"), widened by LATER 121, 139, 144 and 305 (research 210 s9.1). It is labelled neither a reading nor an adaptation: it
is a controller's ruling, and its one named stand-in is its slack, `C4_SURFACE_SLACK_PLACEHOLDER` ("nothing of the
game's", research 210 s9.1). By section 1 the original tests **no** line in the plant's start (`FUN_005be9a0`
D:L475379-475453) or its callback (`FUN_005c1970` D:L476905-476985): where the head's line is walled but the aim's
opaque record rests on an accepting target inside reach -- a wall between the head and a point the camera sees over it,
say -- the original shows the prompt and takes the plant. Before C4-GLASS the port showed that prompt and the room then
refused the plant (`c4 walled`); with cure B the page hides the prompt there too. So in those walled cases the fix makes
the page agree with **the room, not the original** (finding 1 of the second follow-up, standing as built: a prompt the
room then refuses is worse than none). Whether the original plants through a solid wall inside reach, and what label the
guard carries, is LATER 1140, for the owner.

**Every caller of the two lines** (the whole workspace: viewer, match, central, tools, shared):

| caller | calls | why |
|---|---|---|
| `match/src/room.ts` `placeCharge` (the C4 branch, the start-eye fallback and the head line) | `c4Line` | C4: the opaque record |
| `match/src/room.ts` `useAction` (the SWITCH and crane press, two calls) | `actionLine` | the action record's face (item 3) |
| `viewer/src/equipment.ts` `c4AimPick` (from `grenade.ts` `c4Pick`, with the head) | `c4Line` | the page asks the room's line (item 6) |
| `viewer/test/c4Line.test.ts`, `accessBarriers.test.ts`, `c4GlassPick.test.ts` | `c4Line` | C4's line under test |
| `viewer/test/cranes.test.ts` (the crane press), `enowapiStandDisc.test.ts` (Enowapi's lever) | `actionLine` | the room's switch press under test |
| `tools/test/refusalMirrors.test.ts` ('throw: c4 *', 'throw: c4 surface') | names `equipment.ts:c4Line` | C4's refusals: unchanged |

No caller in `central/`, `shared/` or `tools/` code. Comments that name `c4Line` for the switch (`room.ts` above
`useAction` and after the switch's call) are outside the claim's lines and left for the next touch of `useAction`.

**The reach everywhere** (the hip gate, `body+0x208 < 396` from `skel_root`, for every plant) is LATER 1139, gated on
research 394's owed watch.

## 6. What would make it proven

A PCSX2 look at a Fish Hook pane through the parity harness: the C4 prompt absent with the reticle on the glass, and
present with it on a plantable surface seen through a pane, a fence or a net within reach, if section 4 finds one.

## 7. Readings

| name | value | what it stands in for | what would settle it |
|---|---|---|---|
| `C4_HIP_POINT_READING` (`viewer/src/equipment.ts`; `net/shotCone.ts` `hipPoint`, `grenade.ts` `c4Pick`, `match/src/room.ts` `placeCharge`) | the hip C4's gate measures from: straight over the feet at the move's root, else the stance's (11.484 / 5.504 / 2.168) (section 8.3) | the original's `skel_root` as `FUN_00215c10` reads it (stand and prone matched on r0004 to four decimals; crouch one of two idles; the moving heights, the posed x/z, the peek, the tilt left out) | a read of which crouch idle plays (5.5039 or 4.7070) and of the root through the plant's own clip |
| `C4_THROUGH_REACH_READING` (retired 2026-11-18, LATER 1139: section 8) | was sqrt 396 = 19.9 u, the feet to the struck point along the ground, strict, for a plant reached through a face the aim looks through (section 5, item 4) | the original's `body+0x208 < 396`: the squared 3-D distance from `skel_root` to the aimed point (`FUN_005be9a0` D:L475400-475405; research 202 s2.1, STRONG; its writer caught running, research 394) | research 394's owed watch with C4 held at a target 19.8 / 20.0 u; then the hip gate (LATER 1139) |

## 8. One hip gate (LATER 1139)

- Date: 2026-11-18. Branch `agent/c4-hip` (from `agent/next` 9bff2d4357, with `agent/wm-swap-c4glass` 46c7ec26e9 merged
  in). The main controller's GO, 2026-11-18. Track: simulation. Status: the value 396 and its measure are **proven**
  (8.2); the hip's stand-in is a **reading, pending review** (8.3).

### 8.1 The measure

The original's C4 plant takes its target only while `body+0x208 < 396` (`FUN_005be9a0` D:L475400-475405, beside the
settle `body+0xe84` at 0; section 1). `body+0x208` is written each frame by `FUN_00215c10` (research 394 caught the
writer running; research 202 s2.1 read its two stores: 100000.0 when the aim holds nothing, else `|v|^2` with `v` the
aimed point minus `skel_root`, the node the body's vtable `+0x88` slot returns). So the gate is a squared 3-D distance
from the hip (`skel_root`) to the aim's point, strict, with no reach along the ground and no height exemption.

The port now has ONE gate, the same on the page and in the room: `c4InReach(hip, point)`, `|point - hip|^2 <
C4_HIP_REACH_SQ` (396), in `viewer/src/equipment.ts`, read by `c4TargetOf` on the page and by `placeCharge` in the
room. It retires `C4_REACH_READING` (32 u, the action's default reach, from the feet along the ground) and
`C4_THROUGH_REACH_READING` (sqrt 396 from the feet along the ground, for a through-face plant only, section 5 item 4),
and with them the `through` plumbing that existed only to choose between the two (`AimPick.through`,
`SurfaceLine.through`, `throughBefore`). What C4-GLASS needs for the looked-through / walled decision stays: `c4Line`
passes over what the material rule looks through, and the page asks the room's head line (cure B, section 5 item 6).

### 8.2 The capture (proven)

Shadow PC #3, 2026-11-18 19:56-20:16Z, SOCOM II r0004 under PCSX2 2.8.2, per-frame PINE memory reads of `body+0x208`
beside window shots of the HUD's "PLACE C4 CHARGE" prompt (scored on the icon box and looked at): 19 holds in 7 rounds
across 3 games, MP73 (Sandstorm) `access2`'s breach, the body placed by position writes (record
`agent-mail/evidence/later1139-c4reach/unpacked/RECORD.md`, `TABLE.txt`, `trials.csv`; the evidence kind: a capture
of the original running, not harness-scored, nothing compared with the port).

- The prompt shows at every hold with `+0x208` <= 395.68 and at none with `+0x208` >= 396.23. The bracket holds 396.0
  (sqrt 19.900 u).
- 19.8 u (391.1-391.9) shows the prompt; 20.0 u (399.1-399.6) does not, in both orders.
- `+0x208` is the live squared distance past 396 too (397-410 in the holds, a smooth rise in the coarse sweep), not
  clamped: 100000 only when the aim holds nothing that takes the item.

So `C4_HIP_REACH_SQ = 396` is **proven**. The reach record itself does not read `skel_root`'s position (its first pass
followed `body+0x2e8` to another node) nor the aim's hit point; the hip capture beside it (8.3) does.

**The 19.8 / 20.0 u trials were crouched** (the hip capture's finding, below: the body's root there is 4.7070 over the
feet). At the same feet, standing reads `+0x208` 405.8 and crouched 391.6: the word moves with the root's height, so the
gate is on the 3-D distance from the hip, not along the ground (the hip capture's check (c): solving along the camera
ray puts the hit on one face for both stances at the same feet, consistent with `+0x208` = |hit - skel_root|^2 and
`skel_root` = the feet plus the posture's root).

### 8.3 The hip's stand-in (`C4_HIP_POINT_READING`)

The port poses no `skel_root` in the room. Its stand-in is `hipPoint(body)` (`viewer/src/net/shotCone.ts`, beside
`headPoint`): `toWorld(feet, yaw, [0, moveRoot ?? rootY(posture), 0])` -- straight over the feet at the move's root,
else the stance's root height (`viewer/src/mover.ts` `STANCE`: stand 11.484 and crouch 5.504, `skel_root` read off the
console dump `spawn_pcsx2.rdram`; prone `PRONE_ROOT` 2.168, `seal_prone`'s `skel_root` at key 0; `net/blast.ts`
`ROOT_HEIGHT` holds the same three as the idle clips' key 0). The page and the room call the same `hipPoint` with the
same body (`WalkMode.startBody`, `Room.startBody`: feet, yaw, posture, `aimRoot`'s move root); a page with no body uses
the feet plus `rootY(snapshot.stance)`.

What the stand-in leaves out, named as one reading, `C4_HIP_POINT_READING` (`viewer/src/equipment.ts`): the posed
root's x/z offset from the feet, the peek's shift across, the root's tilt (prone on a slope, `rootTilt`), and a posed
root outside `aimRoot`'s cases (the plant's own clip, `seal_put_onwall`, which the original keeps posing through the
gate's frame). **The hip capture** (Shadow PC #3, r0004, 2026-11-18, per-frame PINE memory reads of the original, not harness-scored;
`agent-mail/evidence/later1139-c4reach/unpacked-hip`, from `l1139-hip.zip`, sha256 16a5a6497a7f...a61b96): `skel_root`
is `*(body+0x2e8)` (the node with no parent and an identity rotation; `hips`, `+0x304`, is its child); its world place is
the model block `*(body+0x28)` applied to its local translation, which upright is the feet (`body+0x1c`..`+0x24`) plus
(0, t.y, 0) -- on a ramp `body+0x2e4` differs from the feet's y by up to 0.61.
- **Still, over the feet**: stand 11.4844 and prone 2.1680 -- the port's 11.484 and 2.168, **confirmed to four
  decimals**. Crouch has **two** constant idles: 5.5039 (1 trial; the port's 5.504) and 4.7070 (3 trials) -- the port's
  crouch is **confirmed for one of the two**; which idle plays when is unread (the trials had the shotgun in hand).
- **Moving, steady**: the full run 10.3047; the walk at stick 0.376 11.0176; a crouch at full stick goes to the run
  (upright, 10.3047, the posture word staying 1); the crouch walk 9.3281; the crawl 2.2891.

The controller's ruling (2026-11-18): the stand-in stays one per-posture constant, `hipPoint` = feet + (0, moveRoot ??
rootY(posture), 0), named as a reading with its source. Its departures, all under `C4_HIP_POINT_READING`: the second
crouch idle (4.7070: a crouched plant there is judged from 0.80 too high), the moving heights (no rule for a moving hip
is modelled), the posed x/z, the peek, the tilt, the ramp's 0.61, and a posed root outside `aimRoot`'s cases. No rule
for which crouch idle plays is invented here.

### 8.4 Where the room judges: the plant's start

The page judges the gate when the plant is pressed (`c4Now` at `plantC4`), as the original reads `+0x208` at the plant's
start (`FUN_005be9a0`). The plant clip `seal_put_onwall` carries the root 1.8 u along the body's z (`motion.rdr`,
`viewer/src/mover.ts` `HOLD_CLIPS`; the room's mover carries it away from the face, `roomC4HipReach.test.ts`), so a
room that judged at the throw's arrival could split from the page near 19.9.
The room keeps a `hip` on the placing's start (`placeStart.hip = hipPoint(startBody)`, `noteThrowHold`) and
`placeCharge` makes one hip check: from `start.hip` when the start is this plant's (the 99 s fallback, or the plant's
own window: within the clip plus `C4_START_EYE_TICKS_PLACEHOLDER` and `FIRE_ARRIVAL_JITTER_TICKS`, the feet within
`C4_START_EYE_FEET_PLACEHOLDER`), else from `hipPoint(startBody)` now. The check sits where the first old check sat:
after the target, before the head line (so a far point is 'c4 reach', a walled one in reach 'c4 walled').

### 8.5 One case table, both sides

`viewer/test/helpers/c4HipReach.ts` holds the cases; `viewer/test/c4HipReach.test.ts` drives the page (`c4TargetOf`, and
`GrenadeThrower` with a `startBody`), `match/test/roomC4HipReach.test.ts` the room (`placeCharge`): standing at hip
height 19 taken / 21 refused; 19.8 taken / 20.0 refused; through a GLASS pane 19 / 21; crouched with the point 12 up and
19 along refused (20.08); prone, 12 up, 17 taken / 18 refused; a ledge 10 over the hip 17 / 18; a point at floor level,
standing, 16 / 17; section 4's five places (MP6 `access1` behind `beer3` / `beer4`, MP73 `kill_radio`, MP83 `access1` /
`access2`) refused through or plain, and its four taken rows (gaps 0.0, 1.4, 12.3, 16.5) taken -- on synthetic geometry
at each gap (the gap along the ground at hip height; not the maps' own stand points); in the room only, a plant started
at 19.5 u that the clip's travel would carry past 19.9 is still taken.

### 8.6 What changes for a player (the risks)

- **Every plant from 19.9 to 32 u is now refused.** Section 5's census found 4,545 plants taken on the trunk from stand
  points 20-31 u along the ground (14,706 tried on 11 maps): every one is now refused, on the page (no prompt) and in
  the room ('c4 reach'), as on the original.
- **A crouched or prone plant on a chest-high target refuses sooner**: the hip is lower (5.504, 2.168), so the height
  to a target at 12-20 u up counts. Crouched at 19 u along with the point 12 over the feet is 20.08 u from the hip.
- **Height now counts**: a ledge or a high barrier face, or a floor-level item on a table or the ground, is farther from
  the hip than along the ground (standing, a point on the floor is out past about 16.25 u along: 396 - 11.484^2 = 16.25^2).
- **The stand-in's departures near the boundary** (8.3): the second crouch idle (0.80 lower), a moving hip, the posed
  root's x/z, the peek, the tilt and the plant's own pose can each move the original's distance where the port's does
  not; a plant within that of 19.9 may be judged otherwise than the original. The capture's own 19.8 / 20.0 pair was
  crouched on the 4.7070 idle: the port, crouched, stands that hip 0.80 higher.
- **MP6 `beer4`'s gap is 19.9** (19.9^2 = 396.01): refused by a 0.01 margin, on the gap, which is a lower bound.
