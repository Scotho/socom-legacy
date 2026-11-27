# 430 -- Where a resting round's blast lines start: 0.1 past a wall it rests against (WM-29, report 107)

- Date: 2026-11-15. Branch `agent/wm-ffblast-walls` (worktree `wt-wm-ffblast-walls`), base `origin/agent/next`
  8e78f9ecb7; the weekend mega sprint's WM-29 ("grenades through walls", the bug-report review's item 107: "a retest
  on live first, then LATER 991 and 996 if damage still passes a floor"), the main controller's ruling of 2026-11-15
  (research number 430, the plan below).
- Track: simulation. Status: the original's start point a **reading, pending review** -- read at the bytes in r0001
  and r0004 by 8f's second read (2026-11-15, at e91bb3b6ec; hub `reviews/research-430-second-read-e91bb3b6e.md`), not
  re-read here; the fix (d59200ce54 the start, 6a7587928a the blast's ray rule, the ruling (A) folded after 8f's check) is **not handed on** before its GREEN and its review (the
  controller's ruling); the port's paths **source inspection at 8e78f9ecb7**; the recordings **a recording of the
  port**, never of the original.
- Evidence kinds, kept apart: **(D)** source inspection of the port and of the research notes that read the
  decompilation (no decompilation on the PC this was written on: every `FUN_` / `D:L` here is the notes' citation);
  **(R)** the port's own recordings, read on the hub by seat numbers only (WM.R19) and re-flown on Shadow PC 3 (s2);
  **(U)** the RED tests (s4); **(O)** the original running: none yet -- a rig leg is queued (s5).
- LATER 1094 (2026-11-18, s8): the blast modes ask the rule only of what the original's walk reaches -- the cells a
  line marks and the node boxes on the way down; B is the oracle. Reading, pending review.
- The trunk's document-only version of this note (merge 36, 2026-11-15) opened on a status block, "the rule this note
  describes is NOT on the trunk", and tagged its sentences "on the lane's working head only". Both are retired at LATER
  1094's merge (agent/next merged into agent/wm-ffblast-hub, 2026-11-19): the rule, the start point and the walk land with
  it, and the text below describes the trunk.
- New names: `BLAST_ON_FACE_START_READING` (s6; the successor seat on the hub, 2026-11-15); `GRID_COVER_HALF_WIDTH_READING`, `BLAST_BATCH_CELLS_READING`,
  `BLAST_SWEEP_NODE_BOX_READING`, `CLUTTER_FREE_ROOT_BOX_READING` (s8.4, 2026-11-18). The fix REMOVES `IMPACT_SIGHT_READING` and the room's `sightFrom` (the ledger row retired to research
  101 s5).

## 0. The answer

1. **The v0.4.21 fix is live and holds**: of 74 blast kills by a thrown round in the four recorded matches played on
   v0.4.22 (the only recorded build since v0.4.21 with play), 70 have nothing between the burst and the body, 2 are
   bursts under water (as the original by the reading), 1 cannot be told, and **1 is a blast through a wall** (s2).
2. **That one is a new path, not LATER 991's remainder**: an M67 came to rest 0.037 u from a stone wall's face; the
   room started both blast lines 0.1 toward the body (`sightFrom`, IMPACT_SIGHT_READING), past that face; the wall's
   far face was then met from behind and the one-sided rule passed it. Started at the round's own lifted point -- the
   original's start, read at the bytes (s3) -- both lines refuse. In the original a grenade resting against a wall does
   not reach a player behind it.
3. **The fix** (d59200ce54, 6a7587928a and the fold of 8f's check; handed on only after the GREEN and the review): every blast line, of every round kind and
   every consumer (players, hostages, resting charges, the scene, and the page's offline `grenade.ts`), starts at the
   round's lifted `+0x48` with no further offset; `IMPACT_SIGHT_READING` and `sightFrom` are removed. Every map, no
   case per kind. (The first build, 407408fd03, kept the 0.1 for impact rounds; 8f's read showed an impact's point is
   the intersection itself, so that case was not the original's.) The page's part: c.f. s3, built with its claim.
4. **LATER 996**: nothing of it is open (its first term fixed by b4979f1b12, live since v0.4.21; "closed by the
   ladder", research 400 s10). Struck with this task's merge.

## 1. Every way a blast reaches a body today (D)

- Fragments, the ring, the flash and the knock (`resolveBlast`, viewer `net/blast.ts`): only when `seen` -- both lines
  clear (`Room.blastLines`: line 1 `blastLine1`, the PENETRATION product, to the feet + `BLAST_LINE1_END_PLACEHOLDER`;
  line 2 `blastExposed` to the posed head, `BLAST_HEAD_OVER_READING`). A solid face met from its front stops either.
- Players: a projectile's blast, the bomb, a scene round -- all through `blastPlayers`, both lines; hostages through
  `blastHostages`, both lines; resting charges through `blastCharges`, one line (`blastSeen`, any face blocks); the
  scene through `sceneBlast` (`blastLine`, the PENETRATION product). Every one started at `sightFrom(lifted, end)`
  until this task; now at `lifted` itself.
- A round with IgnoreExplosionDI (C4's record alone) skips both lines by design of the reading (`FUN_005a0e70`
  D:L459192-459193, `FUN_003c80e0` D:L319096; research 235 s1, PF-35): C4 through a wall or floor is the original's.
- A direct hit (`directHit`): a contact, no line -- and only for an impact record (`flyFrame` casts against bodies
  only when `record.impact`: the M203's), never a hand grenade.
- No path lays blast damage without a line test, but IgnoreExplosionDI's and the direct hit.

What could still pass a wall or floor by the code as read: LATER 991's remainder (the standing line-1 end 11.3 with
the true end in [unread, 11.31); crouched and prone ends the root heights, unmeasured; the prone head a placeholder);
the one-sided rule (`BLAST_LINE1_SIDES_READING`, H421, unmeasured: a one-faced floor slab with the burst under it); the
see-through set (INVISIBLE_DI, METAL_GRATE; F1 measured 10 of 10 hurt through INVISIBLE_DI on the original,
research 400 s10). And, found here, the start offset (s2, s3).

## 2. The recordings, re-flown (R)

The hub ran a query over the repository's replay reader (main's readers at d84cf7e893; the script
`agent/wm-ffblast-records:queries/ffblast-query2.ts`): one row per blast kill -- the victim's last feet and stance, and
the killer's throw of that kind whose 3 s fuse ends at the kill. Matches: the nine recordings on the hub played since
v0.4.21, four with play (all v0.4.22, ce3369b4f5: MP7 twice, MP12, MP71); the 2026-10-30 pull predates the fix and is
not re-flown. 81 blast kills: 7 placed charges not re-flown (five PMN, a C4, a claymore -- each at its layer's own
feet or by a trip), 74 thrown (71 M67, 3 HE).

Each throw was flown again by `tools/blast-refly.ts` (agent/wm-ffblast-walls 080adbf206; Shadow PC 3, Node 24.13.1,
SOCOM_DISC present, through the PC's CPU lock 2026-11-15T09:05:44-09:05:57Z, exit 0): the room's own flight
(`launchGrenade`, `stepGrenade` over `gridCast`, a game frame at a time) from the recorded launch over the disc's hull
to its burst, then the room's two lines from the burst's lift. **Every one of the 74 re-flown bursts ends within 2
ticks of its recorded kill.** Classes:

| class | count | what |
|---|---|---|
| open | 70 | no face of any kind on the straight line from the burst to the body |
| water | 2 | MP12: the M67 sank under a water surface (`di_water_out`, `di_water_inside`, WATER, PEN 0.6) beside the body (44.7 u, 16.4 u): line 1 passes on the PENETRATION product (reach 150 x sqrt(0.6) = 116 u), line 2 meets the water from its back and LIQUID is seen through -- the original's by the reading |
| not told | 1 | MP7, an HE, a crouched body 55 u off: today's lines refuse it at every start offset, yet the recorded build (the same line code) landed it -- the reconstruction (a body one tick old, its posture) differs from the room's |
| through a wall | 1 | MP12: s2.1 |

The re-flight is this tree's flight, not the recorded build's (the same since v0.4.21 for these rounds); the doors and
destructibles stand as the map loads; the body is its last snapshot before the kill (1-2 ticks old), its posture the
stance code.

### 2.1 The case (R, D)

MP12, v0.4.22: seat 1's own M67 killed seat 1 (a suicide). The round bounced off `worldmodel/cbigbase` (STONE, PEN 0)
and came to rest 0.037 u from its face (`tools/blast-refly-start.ts`: the wall bounce at frame 47, rest at frame 49;
the faces within 3 u of the lifted point: `cbigbase` 0.037 ahead in +z and 0.32 above, a bomb hole 1.1 below). The
body stood 105.7 u off, behind 11.5 u of that stone: on the straight line from the burst's lift the wall's near face
(met from its front) at t 0.000 and its far face (met from behind) at t 0.109 (`tools/blast-refly-faces.ts`). The
room's lines, from `sightFrom(lifted, end)` -- 0.1 toward the end -- start past the near face; the far face is passed
by the one-sided rule; line 1's product then has no face, line 2 no cover: **both open**. From the lifted point itself
(offset 0) or 0.01 toward the end: **both refuse**.

## 3. The start point: the original against the port (D)

Read at the bytes by 8f's second read (r0001 and r0004; reading, pending review; addresses as it gives them):

- **The body's ray** (`FUN_005ac070`; r4 0x5b1d00) starts at the round's own `+0x48`, passed as a pointer and copied
  word for word (r1 0x5ac17c, r4 0x5b1e0c): no offset toward the target, none along a normal, no pull-back. Its end
  is one point: the posed bone `+0x308` (the head) plus the body's `+0x1c`.
- **Line 1** (`FUN_003c7ee0`; r4 0x3ea060) starts at the same `+0x48` (r1 0x3c7ff8, r4 0x3ea178) and ends at the
  midpoint of the target node's box.
- **`+0x48` at the burst** is lifted +1.0 in y (`FUN_003c8330`, r1 0x3c8700-0x3c871c, r4 0x3ea880-0x3ea89c; x and z
  untouched; `BLAST_POINT_LIFT_READING`, LATER 992). The `+0x54` -> `+0x48` copy and the state-5 line-1 queue are in
  `FUN_003ca5a0` (D:L320292-320297), not `FUN_003c9fb0` as research 400 s11 and viewer `net/blast.ts` said.
- **A resting round's centre** is the floor hit point + 0.1 x the floor's unit normal (`HandleBounce`, `FUN_003c8f50`,
  D:L319688-319697; r1 0x3c9420-0x3c94ac, r4 0x3eb5b0-0x3eb63c); coming to rest (speed under 5, a fall turned upward:
  state 2, `+0xb` = 1, D:L319672-319685) uses the same placement, and the resting `+0x48` is then kept. So it is 0.1
  along its floor's normal, on the near side of any wall, and 0.1 or more from a wall it bounced off.
- **An impact's point** is the intersection point itself, on the struck plane to float precision (`HandleImpact`,
  `FUN_003c8920`, r0001 0x3c8964-0x3c8978, D:L319379; r0004 0x3eaaf4-0x3eab08), copied to `+0x48` by PreTick (r1
  0x3ca6e0, r4 0x3ec880), then +1.0 in y: no move back along the incoming direction, none out along the normal. The
  0.1 along a normal belongs to a bounce and the rest that ends one, never to an impact.
- **The ray query** (its VU0 microprogram, instructions 288-333, byte-identical in both builds: r1 file 0x2c6b50, r4
  file 0x2f1cf0) is one-sided on the hull: a hit needs the start in front of the polygon's plane (to within 0.00001) and
  the end behind it; an end is behind only when its distance + 0.00001 < 0; no minimum distance, no start epsilon.
  Two-sided only on a collider with `+0x80` bit 1 set. The body's walk skips only a hit at exactly zero distance
  (D:L459149). The port's one-sided test (scene `segment.ts` `frontSides`) is that rule. *Refined by s3.1.*
- **So**: a resting round's centre is on its own side of the wall; the line to a body behind crosses the near face from
  in front; stone vetoes line 2 and line 1 refuses (its factor 0 under 0.0001). From an impact's point on a wall, a body
  in front is reached (its end is not behind the struck face) and a body behind is not.
- **The port** (until this task): `sightFrom` moved the correctly lifted point a further 0.1 toward the end, in
  `blastLines`, `blastCharges` and `sceneBlast`, and the page's copy in `grenade.ts` `explode` the same. Its doc ("a
  grenade at rest, already 0.1 off its floor, is not changed in effect") held over a floor, not against a wall. Research
  179 s8.9's "no offset" was right at the call and silent on the lift and the rest placement (corrected there).
- **The re-fly's 0.037** (8f's note 7, checked): the face 0.037 ahead of the lifted point is `cbigbase`'s slanted face
  (normal (0, -0.11, -0.99)), the one the round bounced off; at the rest height the rest point lies about 0.14 from it,
  more than the bounce's 0.1 -- the +1.0 lift moves the point toward that overhanging face. So the port's flight
  agrees with the original's placement; only the start offset differed. No second divergence to file.
- **The fix (d59200ce54)**: `sightFrom` and `IMPACT_SIGHT_READING` deleted; `lifted` and the end passed straight to
  `blastLine1`, `blastExposed`, `blastSeen` and `blastLine` in `blastLines`, `blastCharges` and `sceneBlast`. The page's
  `explode` takes the burst's lifted point straight to `blastLine` (its own commit after its claim's entry, acefbce685). Guarded (s4): from an impact's point
  on a wall the room still reaches a body in front and not one behind; the scene's `blastLine` is two-sided
  (`BLAST_REACH_LINE_SIDES_READING`, the port's), so a start on the struck plane is asked of it too.

### 3.1 The plane test at its boundaries (8f's micro addendum and its fresh re-decode)

8f's addendum (hub `reviews/research-430-micro-boundaries-addendum.md`) and its fresh re-decode of instructions 270-363
in both executables, byte-identical (hub `reviews/research-430-micro-redecode-addendum-2.md`); reading, pending review:

- **The normal is RAW**: n = (p2 - p1) x (p0 - p1) of the first three vertices (instructions 280-286); no divide, square
  root or stored plane anywhere in 279-312 (CONFIRMED by the re-decode). The plane goes through the polygon's LAST vertex.
  So each band is 1e-5 / |n| in world units, far under 1e-5 u for a wall-sized polygon; the port's `frontSides` measures
  the same way (its plane point p1: the same for a planar polygon).
- With ds = n.(start - plane point), de = n.(end - plane point): one-sided, a hit iff ds + 9.99999975e-6 >= 0 (the start
  in front, INCLUSIVE; 0xb727c5ac at 290) and de + 1.0013580322e-5 < 0 (the end behind, STRICT; 0xbf800054 + 1.0 at
  296, 307). Two-sided (the start's fourth word 0x30) also iff ds + 9.99999975e-6 < 0 and de + 1.0013580322e-5 >= 0 -- a
  start whose plane holds it is classed in front in both modes, so no special rule.
- t = ds / (ds - de) (318, 324) used as computed: never clamped, never rejected. Then the edge program (336-361): per
  edge in vertex order, its normal n x edge (unnormalised); (hit - the edge's previous vertex) . that normal +
  9.99999975e-6, rejected when negative; no test of t anywhere. A clamp of t combined with a zero-distance skip would
  drop the very face the original keeps (a start in the band gives a small negative t, and the hit is taken).
- **What follows (for the owner; a reading, with the rig leg of s5)**: an IMPACT round's blast (a rocket, an M203)
  starts on whichever side of the struck face the single-precision hit point falls, and a hair behind it REACHES a body
  behind the wall -- the original's own behaviour as read, if the rig confirms it. The tests' x 0.7 (s4) is that case
  on the port's float32 residual.
- **The port against it**: the default one-sided path (`crossing` with `frontSides`) has the same raw normal and start
  bias; it differs by its window on t (a crossing below -1e-9 rejected), by its end bias (1e-5 against
  1.0013580322e-5) and by its edge test (`inside`, 1e-7 on the plane's projection). The scene line's two-sided default
  crosses either way inside the same window. The fix (B): one opt-in mode in scene `segment.ts` ('blast',
  'blast-scene') with the micro's rule -- the raw normal, the plane through the last vertex, both biases, t
  unclamped, the edge program -- for the four blast line tests only (the controller's ruling); every other caller keeps
  the default path. Named, not matched: the port computes in doubles where the original rounds single precision toward
  zero (re-decode s5). Applied at 6a7587928a. **8f's check of it** (hub
  `reviews/wm-29-segment-check-6a7587928.md`): 'blast' MATCHES with named departures (doubles; the edge measured from
  its start vertex where the original measures from its end vertex on edges 2 to n, the same in exact arithmetic);
  'blast-scene' DOES NOT match the original's two-sided mode as one reader decoded it -- instructions 354-359 negate n
  once per edge pass for a crossing from behind, so the original's two-sided mode makes practically no from-behind
  hits (decoded, not measured) -- and as far as read the original's scene line goes through the one-sided hull batch.
  The controller's ruling (A): no flip is built; 'blast-scene' is the PORT'S OWN DEPARTURE
  (`BLAST_REACH_LINE_SIDES_READING`), a two-sided line with the original's biases and no flip, kept because it is what
  the scene did before WM-29; one-sided or two-sided is **LATER 1087**, settled by a second reader's decode of
  instructions 354-359, or the rig (a destructible behind a one-faced wall, a blast from behind it). Also folded: the
  body walk's skip of a hit at squared distance exactly 0 on the line to the head (`blastExposed`; `FUN_005a0e70`
  D:L459149; line 1 and a resting charge's line have none, `FUN_003c80e0`); no hit when ds - de = 0.


**The scene line's sides, settled (LATER 1087 (b), 2026-11-19; reading, reviewed).** A second reader decoded the VU0
microprogram from the ELF (the MPGs at file 0x2c6b4c, micro 0-255, and 0x2c7354, micro 256-417; the jump table 0x10 ->
288, 0x20 -> 336) and a fresh reviewer re-decoded it with its own decoder, line for line the same
(agent-mail `reviews/later1087-decode-review.md`, PASS WITH FINDINGS, high). The scene line (`FUN_003c7ee0` ->
`FUN_0031dd90`, type 2) is drained by `FUN_0031de30` -> `FUN_002d3cf0` (D:L219908) into the BATCHED `FUN_002d3030`
(D:L175698-175710), whose type-2 branch takes the mode per collider (D:L175246-175282): 0x30 when `+0x80` bit 1 is set, else
0x20. The hull's colliders (`FUN_00316e30`) clear bit 1 (D:L215827-215828), and the only colliders that set it are the
particle box of `FUN_0032ad20` (D:L227610-227611) and the SEAL's body (`FUN_00553ea0`, D:L419731). So the scene line is
ONE-SIDED on map geometry: a face blocks it only when met from its front (0x20 hits a start in front, inclusive, with the
end behind, strict). The 0x30 mode's flip (micro 354-358: the face normal negated at each edge passed, for a crossing
from behind) corrupts every second edge's test (micro 351-352 build each edge normal from it), so from behind it rarely
hits the face itself and can report false hits off it -- moot for the hull. The port's scene line is made one-sided
(`BLAST_REACH_LINE_SIDES_READING`), the controller's ruling (A) of 2026-11-15 superseded; its two-sided 'blast-scene' mode
was retired by LATER 1252 (2026-11-20: `segment.ts` keeps the one rule; WM-29's oracle suite asks it alone). Owed for proven: the rig
(MP6's bar; `sceneLineOneSided.devdisc.test.ts` holds the reading).
## 4. The tests (U)

- `packages/match/test/roomBlastRestStart.test.ts` (synthetic, no game data): an M67 dropped at x 0 rests there; a SEAL
  stands 30 u off behind a wall whose near face stands at x `near` (wound toward the round) and far face at x 11.5
  (wound away). Controls: in the open he is hurt; with the near face 0.5 off he is spared. RED: with the near face
  0.05 off he must be spared -- **fails on the trunk** (hurt, one blast and one hurt), 2 of 3 passed, Shadow PC 3,
  through the CPU lock, 2026-11-15.
- `packages/match/test/roomBlastRestStart.devdisc.test.ts` (dev disc; skips without it, a skip and not a pass): MP12's
  recorded throw re-flown over MP12's hull lands within 0.5 u of the recorded burst; the room's own `blastLines` from
  its lift to the recorded feet must refuse -- **fails on the trunk** (true), the same run's PC, SOCOM_DISC present.
- (B)'s REDs (7eba7b6424; the raw normal confirmed by 8f's re-decode): an impact's lifted point "on" a one-faced wall at x 0.05, 0.7,
  0.01 and 123.4, each x's float32 residual and ds (raw normal, -32000) stated, and the micro rule's answer asserted
  for the players in front and behind and the scene in front and behind (x 0.7: behind past the band -- a body behind
  reached, the scene in front refused; x 0.01: behind by the residual inside the band -- in front). Scene
  `test/segmentBlastRule.test.ts`: off the bands the blast modes equal the default path over 200 fixed segments; on a
  plane the rule's answer at the same x's.
- RED commit: 354c280646. The guard (dfa5bdc157), in the same file: an impact's lifted point on a wall's near face --
  (i) a body in front is reached, (ii) a body behind is not, (i, the scene) the scene's two-sided `blastLine` reaches a
  destructible in front. On the trunk (the 0.1 toward the end) (i) and the scene's hold and (ii) fails; on the fix all
  three must hold.
- *Superseded by (B), s3.1 (the line reverted at 6a7587928a):* the scene line's zero-distance skip (the controller's grant; viewer `sceneHealth.ts` `blastLine`, one line, named in
  `BLAST_REACH_LINE_SIDES_READING`'s doc as the port's mechanism under its two-sided departure): the guard's scene case
  (i) is its RED on the fix without the line; two controls in the same file must not change (8a0af20497): a
  destructible BEHIND the struck wall still refused for an impact, and a resting round's scene line through a wall
  0.05 off still refused. Where the line could move a pinned count or a reviewed sweep -- only a scene line whose start
  lies ON a plane (an impact on a wall; a bomb or scene round whose lifted node sits on a vertical face): the dev-disc
  sweeps `sceneRoundsCrossroads`, `fishHookScene`, `roomBlastOcclusion`; central's `bombPlantSweep`, `blastSkipWiden`,
  `roomBomb`, `roomBombRuins`, `roomBombNightStalker` parity tests; viewer `accessBarriers`, `sceneHealth`,
  `sceneHealth.parity`, `blastLine416`, `parity/explosives`; match `roomBarriers`, `roomEquipment`. The census
  (`blastGeometryCensus`) and `blastSeeThroughMp72` copy their own lines and do not call `blastLine`'s room path: unmoved.
  All in the runner's legs; a reviewed sweep's number that moves stops the task for the controller.
- The page: `packages/viewer/test/grenadeOfflineBlastStart.test.ts` (4f33953de1): an M67 at rest offline, `explode`'s
  reach asked for a destructible behind a wall 0.05 off -- must be sheltered.
- `packages/viewer/test/blastExposedZeroDistance.test.ts` (3438e48d62, RED): a start EXACTLY on a one-faced wall's
  plane (x 0.5, ds = 0), the end behind -- line 2 passes the face (the body walk's skip), line 1 counts it (no skip).
- The departure's pins, labelled in the tests (8f's correction 2): roomBlastRestStart's x 0.7 "the scene: a
  destructible in front" (refused), segmentBlastRule's x 0.7 'blast-scene' end in front (1 hit) and its off-plane
  "'blast-scene' equals the default two-sided" -- the port's departure, the original as decoded answering otherwise.
  The x-residual cases test the RULE on the port's double inputs, not a prediction of the original at that spot: in the
  original a start at the wall's own single-precision x has ds = 0, and an impact point's side is its own rounding.
- The first fix 407408fd03, rebuilt at d59200ce54. GREEN: asked of the runner on a box (the typecheck, the tests above,
  the blast family, the placeholder ledger, the match package) -- not yet recorded here. Nothing ran on Shadow PC 3
  after the bench rule.
- Unchanged in verdict by the reading (the fresh review, 2026-11-15): the tests and tools that copy `sightFrom` as
  "the room's" (`blastGeometryCensus`, `blastLine1End`, `blastSeeThroughMp72`, `roomBlastOcclusion` dev-disc tests;
  central's `roomBombRuins` and `roomBombNightStalker` parity tests; `tools/blast-refly.ts`) call no room start, so
  their verdicts stand, but they model the old start.

## 5. Owed

- **The rig leg for an impact on a face** (s3.1): an M203 into a stone face, bodies behind and in front, five or more
  shots at different spots (the hit point at r4 0x3eab08) -- which way the PS2's own arithmetic places the impact point
  against the struck plane, and so whether a body behind is reached.

- **The rig leg** (queued with relay-1, sharpened to 8f's in its record): an M67 thrown into a wall at short range so it
  rests touching it, a body 20-40 u behind the wall, n >= 5. Until it runs the fix is a reading.
- Not read by 8f: the destructibles' own handlers; whether MP12's stone piece is a one-sided hull collider.
- LATER 991's remainder and the one-sided rule's capture (H421): unchanged; none of the 74 re-flown kills needs them.

## 6. Readings

Added 2026-11-15 by the lane's successor seat on the hub (branch `agent/wm-ffblast-hub`), on the main controller's
rulings (a) and (b) of that day. Evidence kinds: **(D)** source inspection of the port; **(U)** unit tests on the hub;
the disc's data **not read on the hub** (no disc there): the dev-disc test below is skipped until the box runs it.

| Name | Where | Level | What |
|---|---|---|---|
| `BLAST_HIT_NORMAL_PLACEHOLDER` | scene `segment.ts` | placeholder | `'the polygon normal, else the raw normal's direction'`: what a blast hit reports as its normal. The original's ray record holds something at +0x10 (the record: `FUN_002d2890` D:L174876-174884), written by the polygon class's ray function, which is not in the decompilation: unread. The vertical-column test beside it writes the unit normal of the first three vertices there (`FUN_002dd8e0` D:L181111-181113, `FUN_002dd030` D:L180713-180763), which suggests, without showing, the same of the ray. The port's choice is its own. Nothing reads it, in the original's blast (`FUN_003c80e0` D:L319096-319143, `FUN_005a0e70` D:L459142-459186) or the port's. What would settle it: the ray function's code (the class table's +0x14, called at D:L174869) or the VU0 micro's output for the record's +0x10. Found by the review of 720e78fd46; its citations not yet re-read by a second reader. |
| `BLAST_ON_FACE_START_READING` | viewer `net/blast.ts` | reading, pending review | `'in front'`: an UNFLAGGED round that bursts exactly on a face -- its lifted start in the face's plane, ds = 0 -- is in front of it by the micro's inclusive start band (s3.1: ds + 9.99999975e-6 >= 0, instruction 290), so that face is hit at t = 0 toward a body on the side its raw normal points away from and line 1, which has no zero-distance skip (`FUN_003c80e0`), refuses him; a body on the side the normal points to is not refused by it; a wall with both faces refuses a body on either side. Pinned by `match/test/roomBlast.test.ts` ("an unflagged round that bursts exactly on a face"). Beside it at its own level, the original running, pending review: the rig's MP12 legs, fifteen impact bursts (nine M203, six RPG) on a stone face, a body behind never touched, bodies in front hurt or killed about half the time (hub `rig/RELAY1-mp12-window-open-RPG-total-B3-heights-1305Z.md`). What would settle it: the review of those legs, and a read of where a PLACED charge's `+0x48` sits against the face it is set on (unread: `net/blast.ts`, the note over `BLAST_POINT_LIFT_READING`; research 400 s11). |

**Why the head was red at 8176be455c** (the box record of 12:44Z; found by source inspection, then held by the tests):

1. *The C4 cases* (`roomEquipment.test.ts` two, `roomBlast.test.ts` two). The room sets a planted C4 at the struck
   point its page names (`room.ts`, `pos = [...surface.point]`): on its target's face. The lift is +1.0 in y, so the
   start stays in the wall's plane. Until this task `sightFrom` moved it 0.1 toward the body, off the plane; with that
   gone the reading above applies, and the fixtures' C4 was UNFLAGGED -- a round the disc does not have. The disc's
   `C4 Ammo` carries `IgnoreExplosionDI` (research 235 s1; `scene/test/projectile.test.ts` on the committed byte copy of
   `RUN/ZWEAPON.ZAR`: 39 `ZAMMO` rows, `C4 Ammo` (18) the one flagged) and asks no line. The fixtures now carry the
   disc's record; the unflagged case stays as the named pin. The condition of the ruling -- the flag in EVERY file of
   the disc that holds an ammunition table -- is `scene/test/c4IgnoreExplosionDIDisc.test.ts` (dev-disc: every `.ZAR`
   on the disc and every `.ZAR` member of a `.ZDB`, the holders printed by file and script): **skipped on the hub, not
   yet run**; its count and any file that differs are the box record's to say.
2. *The x 0.01 cases* (`scene/test/segmentBlastRule.test.ts` one, `roomBlastRestStart.test.ts` two once it loaded). The
   start (the double 0.01) lies 2.2e-10 behind the wall's float32 plane; the rule calls it in front (s3.1), but the
   grid's broad phase -- the port's own, the default path's footprint reject -- dropped the owner before the rule was
   asked. In the two blast modes only, the cells, the footprint and the polygon's box are widened by the rule's band as
   a distance (`segment.ts` `polyBlastBand`: BLAST_END_BIAS / |n|, and the edge test's share) and the reach prune is not
   asked; every other caller's rejects are unchanged (`segmentBlastRule.test.ts`, "the default path at the same spot is
   unchanged"; `sceneAllocA.test.ts`'s pin against the frozen base). Red since the case was written (7eba7b6424), not
   from the trunk's merge.

**The fresh review's fold** (PASS WITH FINDINGS, 2026-11-15; its record on the hub,
`reviews/wm-29-hub-review-f294acd1ce.md`). (1) The band bounds a hit point across a plane and its edges, not along the
line: the rule has no test of t (s3.1), and one-sided a start inside the band behind a plane gives t in
(-Bs / (Be - Bs), 0), about 736 segment lengths back. In the blast modes the broad phase now asks the LINE from that t
to 1 by a slab test against each footprint and box widened by the band (`segment.ts` `BLAST_T_BACK`, `lineMisses`); RED
first (`segmentBlastRule.test.ts`, "a hit point back along a shallow line"). A known limit, the two-sided mode only
(the port's own departure, LATER 1087), restated to the second review: a crossing from behind whose END is still behind
the plane inside the end's band (de in [-Be, 0)) has t outside the segment with no bound -- past 1 when ds < de, the hit
beyond the end by any distance on a line shallow to the plane; below -Bs / (Be - Bs) when ds > de, both sums then in the
1.4e-8 gap between the biases. No hit outside t in [-Bs / (Be - Bs), 1] is sought; no test pins such a missed hit as
correct; the one-sided mode (the original's) has no such case, its t lying inside that range. (2) The dev-disc test fails on any archive or
script the readers refuse, opens a `.ZAR` nested in a `.ZAR`, and seeks `ZAMMO` at any depth; what it does not look into
is said in its header. (3) Said, not changed: with C4 flagged, `roomEquipment.test.ts`'s scene-line case ("along a line
clear to its midpoint") no longer asks the line for C4 -- no case in that file expected a C4 blast to be blocked.

**The second review** (of the fold cfe27aa889 alone: FAIL; the same record file). Its finding 1 was the first build's
band, not the fold: at a sharp corner the edge test's two offset lines meet delta / sin(corner / 2) outside the vertex,
so a sliver's hit just outside its tip was still dropped, in the one-sided mode too. RED first (`segmentBlastRule.test.ts`,
"a hit point just outside a sharp corner"), then the band takes each corner's term (`polyBlastBand`, as `polygonReach`
does for the default path's `inside`). Its finding 2 is the limit's restatement above. Its finding 3: the dev-disc test
counts the bare field anywhere in a row (the reader's `rdrGet` sees a key only where a value follows) and opens `.ZED`
archives; what it still does not look into is said in its header, and it shows every ammunition table in a script of
the disc's archives, not every byte of the disc.

**The third review** (of 0261265e83: FAIL; the same record file). The one-sided mode can still drop a hit the rule
accepts: a polygon that is not planar (s7 case 4; its input, by hand arithmetic on a transcription of the rule, not a
run: the quad (0,0,0) (1,1,0) (1,1,1) (0,1,1), a line at x = -0.3586 from y 0.5414 to 0.7414 at z 0.1, a hit at t = 0.5
that the box reject drops). It found convex planar polygons sound, the two-sided limit's statement accurate and unable
to change a one-sided outcome, and no test pinning a missed hit as correct; in the dev-disc test, two gaps left (a bare
field ending a nested sub-list; a key in another case). By the controller's ruling nothing was folded after it then: the
box job was stopped before it started and fallback (C) applied. (Its case is s7's case 4; LATER 1094's walk, s8, settles
it by the original's node box.)

## 7. The broad phase: the whole case list, set out before any further build

Written 2026-11-15 after three failed reviews, on the controller's ruling: no build before this list and its
alternative, with costs, have been read. Evidence kind: **(D)** source inspection of the port at 0261265e83 and
derivation from the rule as s3.1 states it. Nothing here is measured; what must be measured is s7.4.

### 7.1 What the rule accepts, exactly

For a polygon with vertices v0..v(k-1), n = (v2 - v1) x (v0 - v1) (raw), L = v(k-1), and a line a -> b, d = b - a
(`blastCrossing`): ds = n.(a - L), de = n.(b - L); one-sided a hit needs ds + Bs >= 0 and de + Be < 0; then
t = ds / (ds - de), q = a + d t, and for every edge e_i = v(i+1) - v_i: (q - v_i).(n x e_i) + Bs >= 0. Three facts follow
for ANY polygon, planar or not, convex or not:

1. **q lies on the plane through the LAST vertex with normal n** (n.(q - L) = 0), not on a plane through the first
   three vertices unless the polygon is planar.
2. **Each edge's test is a half-plane of that plane**: n x e_i is perpendicular to n, so the test's boundary meets the
   plane in the line of the edge PROJECTED along n onto it, moved outward by Bs / |n x e_i| -- and |n x e_i| is
   |n| times the PROJECTED edge's length, shorter than |n| |e_i| when the edge leaves the plane.
3. So **the set of points the rule can report is a convex region R of that plane**: the intersection of k half-planes.
   The edges close (their sum is zero), so their outward normals n x e_i sum to zero and R is bounded or empty unless
   the projected polygon is degenerate. One-sided, t lies in (-Bs / (Be - Bs), 1); two-sided, t has no bound (s6).

A sound broad phase is therefore exactly this: **admit a polygon when the line, over the mode's range of t, meets R**
(or any box that holds R). Every bound that failed was a bound on R built from the VERTICES' box instead.

### 7.2 The cases

| # | Case | `polygonReach` (the default path's prune) | The band at 0261265e83 | Sound there? |
|---|---|---|---|---|
| 1 | Planar, convex, both ends outside the bands | bounds `inside`'s 1e-7 by the corner term | the plane term and the corner term | yes |
| 2 | A start inside the start's band behind the plane: t in (-Bs / (Be - Bs), 0), the point back along the line | none needed: `crossing` windows t to [-1e-9, 1 + 1e-9] | the slab test from t = -BLAST_T_BACK (cfe27aa889) | yes (first review's finding, cured) |
| 3 | A sharp corner: the two offset lines meet delta / sin(corner / 2) outside the vertex | its corner term, `max(delta_i, delta_j) / cos(phi / 2)` | the same term (0261265e83) | yes for a planar convex polygon (second review's finding, cured) |
| 4 | **Not planar**: the last vertex off the plane of the first three; R lies in the plane through the last vertex, away from the vertices' box by that vertex's offset | takes the plane through the FIRST point with `polygonNormal`'s normal and widens the third axis by the slope; the default path's `inside` drops an axis, a different test | none: the boxes are the vertices' | **NO** (third review's finding, open) |
| 5 | An edge that leaves the plane: its term is Bs / (\|n\| x the projected length), larger than the band's Bs / (\|n\| \|e\|) | n/a | understated | **NO** (open; the same cure as 4) |
| 6 | Not convex: R is the intersection of all the half-planes, cut by edges that are not neighbours | returns null: never pruned | the corner term looks only at neighbours | **unproven** (open) |
| 7 | A doubled vertex, a fold back on itself | edges of no length left out; a turn back is null | Infinity: never rejected | yes (never rejected) |
| 8 | The first three vertices in a line (n = 0) though the polygon has a normal | n/a | band 0 | yes: with n = 0 both sums are 0, the end is never behind, the rule never hits |
| 9 | **The cells**: an owner is linked into the cells of its VERTICES' footprint; R can lie outside it (4, 5, 3) | the default path's hits are inside the footprint to 1e-7 | the cover is widened by the grid's largest band only | **NO** for 4 and 5: the cell walk may never offer the owner |
| 10 | A moving owner (`sweep`): no cache | never cached, never pruned | its band reckoned each call | as its polygons' cases |
| 11 | The two-sided mode: the same R; t without a bound either way when the end is behind inside its band | n/a | declared, not sought (s6; LATER 1087) | declared limit |
| 12 | Rounding: the port reckons q in doubles | REACH_SLACK | BOX_PAD 1e-3 over the band | yes at map scale (1e-16 x 1e5 is far under 1e-3) |
| 13 | Which hit of an owner counts (`blastLine1`, `blastLine`: the first OFFERED polygon of an owner, not the nearest) | n/a | the owner's polygons are offered in the owner's order whichever cell found it | unchanged by any broad phase that offers an admitted owner's polygons in order |

### 7.3 The alternatives

- **A. Reject by the region the rule accepts (proposed).** For each polygon, once, R's corners by clipping a large
  square of the plane through the last vertex by the k offset half-planes of 7.1 (2); its box, padded by BOX_PAD; no
  box (never rejected) when R is unbounded or not finite. A polygon is asked the rule when the line, from the mode's
  least t to 1, meets that box (the slab test as built). An owner's box is the union of its polygons'; owners are
  taken from the grid's whole list of collision objects, not from the cells (case 9), in a fixed order. Sound for
  cases 1-10 and 12-13 by construction, with no convexity or planarity assumed; case 11 stays the declared limit, or
  is cured by asking the whole line (t over all reals) in the two-sided mode. Cost: one slab test per collision owner
  of the map per blast line, plus the rule on the admitted owners' polygons; six numbers kept per static polygon, made
  on the first blast. The clip is new code with its own tests (a triangle, a sliver, the third review's quad, a
  non-convex quad, a doubled vertex).
- **B. No reject per polygon: ask the rule of every polygon of the map.** Sound trivially (the rule IS the test); the
  rule's first lines (one cross product, two dot products) refuse nearly all. Cost: every polygon of the map, per blast
  line -- a blast asks two lines a body, one a charge, one a destructible. Simplest to review; its cost must be measured.
- **C. Keep the vertices' boxes, widened by the largest off-plane offset measured on the disc.** Unsound in principle (a
  Forge or modded map is not the disc); named only to be set aside.
- **D. Stay on the default path's broad phase and name the difference as a departure.** The rule would then differ from
  the original only for a start or end within about 1e-5 / |n| of a plane or an edge that the default rejects drop --
  the x 0.01 case of s6. It is what ruling (b) was made to avoid; named so the controller can weigh it against A's
  new code.

### 7.4 To be measured from the disc before the design is chosen (the controller's ruling; not arguable from here)

Per multiplayer map, over every collision polygon the grid holds: the count of polygons and of collision owners (B's
and A's costs); for polygons of more than three vertices, the largest and the distribution of the last vertex's
distance from the plane of the first three, against BOX_PAD 1e-3 (case 4: whether it happens at all on the disc); the
count of polygons that are not convex in that plane (case 6); the smallest sin(corner / 2) and the largest corner term
(case 3); the count with n = 0 (case 8). A dev-disc measuring test that prints these, run on a box with the disc.

### 7.5 Measured on the disc's data (box job `wm-ffblast-census-d78c9ac36`, 2026-11-15)

**Kind of evidence:** a dev-disc test and a typecheck run on a box at d78c9ac36b with the disc
(`match/test/blastBroadPhaseCensus.devdisc.test.ts`, 5 passed, the disc case RAN; record on the hub,
`box/wm-ffblast-census-d78c9ac36/keep/`). **Measured on the disc's data through the port's readers** (`loadSimMap`, the
room's grid) -- what the polygons ARE, not what the original does with them. All 22 multiplayer maps were read.

| | All 22 maps | Smallest map | Largest map |
|---|---|---|---|
| Collision owners | 8654 | 154 (MP11) | 836 (MP83) |
| Collision polygons | 201608 | 3321 (MP2) | 19452 (MP82) |
| Moving owners (`sweep`) | 70 | 0 (eleven maps) | 13 (MP81) |

- **Case 4, not planar -- ordinary on the disc.** 4950 polygons (2.5%) have their LAST vertex more than 1e-3 off the
  plane of the first three, on every map: from 22 (MP2) to 824 (MP83). Over 1e-2: 2281; over 0.1: 453; over 1: 4 (two
  on MP52, two on MP83). The largest: 28.89 at MP52 `worldmodel/wc1_2/g1956_1`, then 4.486 at MP83
  `worldmodel/wc01_soBld02`; every other map's largest lies between 0.047 (MP10) and 0.98 (MP51). So the third
  review's case is the disc's own data, alternative C is dead, and any reject must stand on the rule's own plane
  through the last vertex.
- **Case 6, not convex:** 86 polygons, on 13 maps (most: MP64 22, MP52 14).
- **Case 3, sharp corners:** the corner term passes 1e-3 on 26 polygons, on 10 maps; its largest values are not
  finite or absurd (MP72: a corner that folds back, sin(corner / 2) = 0; MP12 1.4e5; MP83 2.1e4; MP52 115) -- slivers
  with a raw normal near 0, for which no finite pad is a bound. The plane's own term passes 1e-3 on 9 polygons (largest
  8.4 at MP83, 0.148 at MP12).
- **Case 8:** 19 polygons whose first three vertices are in a line though the polygon has a normal (MP72 7, MP62 6,
  MP12 4, MP6 1, MP83 1): the rule, as read, never hits them. No polygon normal at all: 16. **Case 7:** 13 polygons
  with an edge of no length.

**The typecheck** at d78c9ac36b: clean (exit 0; `sceneAllocA.test.ts`'s TS2345 gone; no new error) -- the first
typecheck of any head of this branch.

**The dev-disc C4 test** (`scene/test/c4IgnoreExplosionDIDisc.test.ts`) RAN and was **RED**: 2276 archives read, ONE
ammunition table found (`RUN/ZWEAPON.ZAR -> zweapon.rdr`, 39 rows, `C4 Ammo` the one row flagged, C4's record flagged),
and 3360 entries refused. So what stands is **the flag in the one weapon table read**, a reading from one file; the
ruling's condition ("every table of the disc") is NOT met by that run. The 3360, read from the box log's own lines and
the reader's code, not from the bytes (no disc on the hub): every one is a key under `file buffersize table/` of a
`DBUFFER.ZAR` (the UI's, and the ones nested in the `.ZDB`s under COMMON, each MP map and each SP mission), named after
a `.ZED` file, and every refusal is the same -- "read 4 at 4 beyond 4", the reader's second 32-bit read falling off a
4-byte value. A ZAR's head alone is 100 bytes, so these are 4-byte entries of a table of sizes that share an archive's
NAME, opened by the test's own nested-archive rule: the test's fault, not unread archives. The test now leaves a key
shorter than a ZAR's head unopened and prints those by parent and size.

**The re-run** (box job `wm-ffblast-c4-27b07451a` at 27b07451ad, 2026-11-15; a dev-disc test on a box, record on the hub
`box/wm-ffblast-c4-27b07451a/keep/`): RAN, GREEN -- 2276 archives read, NOT READ 0, ONE ammunition table
(`RUN/ZWEAPON.ZAR -> zweapon.rdr`: 39 rows, `C4 Ammo` the one row flagged, C4's record flagged), and 3360 keys named
like an archive but 4 bytes long left unopened, every one under a `DBUFFER.ZAR`'s `file buffersize table` (the UI's 192;
COMMON's 2540, the MP maps' 367 and the SP missions' 261 inside the `.ZDB`s). So, as far as the test looks (its header
says what it does not open): **the disc holds one ammunition table in a script of its archives, and in it C4's round
alone carries the flag** -- a reading of the disc's data through the repository's readers, by file and field. Whether
that meets the condition of ruling (a) is the controller's to say.

### 7.6 B as built (the controller's ruling of 2026-11-15, after s7.5: "build B"; D refused; A only on its word, with B as its oracle)

**Status: a reading, pending review; not on the trunk.** Everything said in s6 and above of a band, `polyBlastBand`,
`BLAST_T_BACK`, `lineMisses` or `blastCrossing` describes builds that are GONE from the working head: three bounds on
the vertices' boxes, each failed in review, none kept.

- **What it is** (`scene/src/segment.ts` `blastHits`): in the modes 'blast' and 'blast-scene' ONLY, the rule of s3.1 /
  s7.1 is asked of every polygon of every collision object of the grid (`grid.objects`, in link order; the owner's
  `modelGate` asked as the default path asks it). No cell, footprint, reach or box stands before it: what is refused is
  refused by the rule's own two sums. `segmentHits` branches to it before the default path's scratch is taken, and the
  default path's code is the trunk's, line for line: outside the added block the file differs from the trunk's by the
  branch's one early-return line, the `frontOnly` parameter's type (widened to `SegmentSides`) and comment text; a
  call with true, false or nothing runs the trunk's statements (the review of dee83b8f95, Q2, by `git diff`).
- **What is kept**: a static object's raw normals, three doubles a polygon, made on its first blast line -- the same
  numbers the sums would reckon, so the sums are bit for bit the rule's. n.L is NOT kept (the controller's ruling named
  it; a kept constant would round the sums otherwise than the rule does, and a polygon a hair inside a band could then
  be classed otherwise than `blastHits`' own arithmetic would class it: said to the controller).
- **Moving owners** (`sweep`: a door, a gate, whose points change in place): nothing kept; their raw normals and their
  polygon normals are reckoned each call, as the default path reckons a moving owner's normals each call
  (`segmentBlastRule.test.ts`, case 10: moved in place, the same line then finds nothing).
- **`accept`** is asked after the plane test and before the edge test, an owner's polygons in the owner's order (case
  13): the blast lines keep an owner's first OFFERED polygon (`blastLine1`, `blastLine`), and that order within an owner
  is what it was. A polygon with NO polygon normal (`polygonNormal` null, its Newell sum 0: 16 on the disc, s7.5) but
  a raw normal is still a polygon to the rule, which knows only the raw normal: the first cut of B skipped it "as the
  default path does" -- an unnamed departure the review found (Q1, its hand-worked quad) -- and it is now asked and can
  be hit, its hit reporting the raw normal's direction (RED first: 1 failed | 14 passed, then 15 passed). The oracle no
  longer copies that skip. Not guarded, as on the default path: a start or end that is not a number.
- **The two-sided mode** asks the same loop: there is no window on t in it, so a crossing from behind with t past 1 or
  far below 0 is found (case 11: t = 2, the whole segment outside the wall's box; a unit test on the hub, the author's
  run). **LATER 1087's named limit closes with this build when it lands** -- it cost nothing; the row on the trunk still
  names the limit and is corrected with the lane's next documents hand; its question (one-sided or two-sided) stays open.
- **The tests** (`scene/test/segmentBlastRule.test.ts`, 15 cases since the fold; unit tests on the hub): s7.2's cases by name -- 4 (the
  third review's quad, RUN, not hand arithmetic), 5, 6, 7, 8, 9, 10, 11, 13 -- and for 1-3 and 12 a sweep of 600 lines
  over eleven hostile polygons against an ORACLE, the rule transcribed in the test and asked of every polygon with no
  broad phase, both modes, the polygons hit compared exactly and t to 1e-9. **RED first**: against the head before this
  build (27b07451ad's `segment.ts`) 5 failed | 9 passed -- cases 4, 9, 10, 11 and the sweep; with `blastHits`, 14 passed.
- **Run since this build, unit tests on the hub, one file a call** (15:04Z): scene `sceneAllocA` 8, `segment` 6,
  `segmentCache` 7; match `roomBlastRestStart` 28, `roomBlast` 21, `roomEquipment` 114; viewer
  `blastExposedZeroDistance` 3, `grenadeOfflineBlastStart` 3 passed. Not run since it: the typecheck, any whole.
- **The review of dee83b8f95** (a fresh reviewer, reading only; hub `reviews/wm-29-hub-review-f294acd1ce.md`): PASS WITH
  FINDINGS, non-blocking. By name: can a polygon the rule would hit be skipped -- only one with no polygon normal
  (folded, above); is the default path the trunk's line for line -- yes. Also folded: case 10 now TURNS the moving
  owner onto another plane (a translation alone leaves a raw normal as it was), case 7's title, this section's wording.
- **The review of the fold 720e78fd46** (a fresh reviewer, reading only, WITH the decompilation on the hub --
  `socom2_game.elf.decomp.c`; the brief named the wrong file and the reviewer found the right one): PASS WITH FINDINGS,
  non-blocking. By name: *does the ORIGINAL's rule hit a polygon with a raw normal and no whole-polygon normal* -- yes, as
  far as read: the query hands VU0 the polygon's first three vertices and starts the micro, with no stored normal or
  plane loaded and no test of a degenerate polygon before it (`FUN_002d2890` D:L174845-174868; `FUN_002dd130`
  D:L180767-180781); *what normal it reports* -- not established (`BLAST_HIT_NORMAL_PLACEHOLDER`, s6); whether the
  collision loader filters such polygons -- not found, not established. *Can a non-finite endpoint arise from the
  room's own callers* -- no path found: the page's points pass `isV3` / `isSurface` (three finite numbers), a throw's
  start and speed are bounded, a C4's point lies on real geometry; NOT traced: the flight integrator, the walker's
  state, the page's offline `explode`, `sceneHealth`'s `blastAt`; one edge named and open: a Forge script blast takes
  its point from authored content, where JSON can parse 1e999 as Infinity (an adaptation's input, not the game's).
  **These citations are the reviewer's own reading; the author has not read those lines, and they count as a reading
  only when the hand-off's review re-reads them** (the controller's ruling of 15:24Z: every FUN_ / D:L the lane rests
  on is re-read at the source then).
- **The gate, to be MEASURED, not estimated** (`match/test/blastBroadPhaseBench.devdisc.test.ts`, dev-disc; not yet
  run): on MP82 and MP83, the mean time of a 'blast' line against 0.25 ms, and the median of the worst whole blast we
  can construct (16 bodies both lines, 32 charges, every destructible of the map) against half a tick,
  1000 / `TICK_HZ` / 2 = 8.33 ms (`TICK_HZ` 60: viewer `src/net/protocol.ts`). Either missed: the lane stops and the
  numbers go to the controller.

### 7.7 The first measured gate MISSED, and B made cheaper with no geometric reject (the controller's ruling of 2026-11-15)

**The measurement** (box job `wm-ffblast-bench-720e78fd4` at 720e78fd46; a dev-disc bench on a c7a.4xlarge, 16
processors, running nothing else; record on the hub, `box/wm-ffblast-bench-720e78fd4/keep/`). The port's cost, measured;
nothing of the original.

| | MP82 (19452 polygons) | MP83 (15613 polygons) | The gate |
|---|---|---|---|
| A 'blast' line, mean of 4000 | 0.2603 ms | 0.2609 ms | 0.25 ms -- **missed** |
| The default one-sided path, the same lines | 0.0077 ms | 0.0114 ms | (for scale) |
| A whole blast, 67 / 68 lines (16 bodies x 2, 32 charges, 3 / 4 destructibles): median | 18.462 ms | 18.304 ms | half a tick, 8.333 ms -- **missed** |
| ... its slowest of 24 | 19.764 ms | 21.480 ms | |

About 13 to 17 ns a polygon a line. The author's estimate before it (0.1 to 0.2 ms a line) was low. The blast was built
past what a round holds; its figures were printed, not asserted (the test stopped at the line's assertion: fixed). In
the same job the typecheck was RED on the author's own line (`segment.ts`, TS4104: the hit's normal typed as the
readonly V3) and stopped at the scene package, so the packages after it were not checked; the lane's nine files were
green on the box.

**The ruling:** the gate stays (0.25 ms a line AND half a tick); B is kept and made cheaper WITHOUT any geometric
reject; the worst blast is re-cut to what a round can hold by the game's own limits; A stays unbuilt unless this misses
too.

**What was built** (`scene/src/segment.ts`, `BlastKept`, `blastStart`, `blastHits`; a reading, pending review; not on
the trunk):

1. *The kept numbers laid flat.* For a static object, six doubles a polygon made once: the raw normal and the LAST
   vertex -- the very numbers the rule's two sums take from the polygon's points -- read in one pass.
2. *The start's sum once a blast point.* Every line of one blast starts at the same lifted point (s3), so for the start
   the sums were last asked from, each static object keeps ds of every polygon and the list of polygons whose start is
   in front. One-sided, a polygon whose start is not in front is out for every line of that blast, and a further line
   costs one sum a polygon that is left. Two-sided, the kept ds saves one sum a polygon.
3. *What makes it the same rule:* the sums are the same expressions on the same numbers as when nothing is kept (the
   flat numbers are the points' own values; ds for a start is reckoned by the one expression, once). The start is
   matched on all three coordinates exactly. The kept sums are used only by the outermost blast query: one made from
   inside another's `accept` reckons its own and writes nothing. A moving owner keeps nothing, as before. No box, band
   or cell was added: what is refused is refused by the rule's own two comparisons.

**The tests** (`scene/test/segmentBlastRule.test.ts`, 18 cases; unit tests on the hub): the thirteen cases and the
oracle sweep UNCHANGED, and three for the kept sums -- 40 starts with 15 ends each and the modes switched on one start;
a start that changes and comes back, and starts that differ in one coordinate; a query made from inside another's
`accept` from another start, with one owner holding every polygon. They cannot be red against B as it stood (it kept
no sums to get wrong), so each was shown able to fail by a deliberate break, then restored: the start matched on x
alone -- 1 failed | 17 passed; the inner query allowed the kept sums -- 1 failed | 17 passed (the first cut of that
test, one polygon an owner, did NOT catch it: 18 passed; re-cut to one owner for all); as built -- 18 passed. The
lane's other files after it, one file a call: scene `sceneAllocA` 8, `segment` 6, `segmentCache` 7; match
`roomBlastRestStart` 28, `roomBlast` 21, `roomEquipment` 114; viewer `blastExposedZeroDistance` 3,
`grenadeOfflineBlastStart` 3 passed. **Not run since:** the typecheck (TS4104's one annotation is made, unverified);
any whole; the bench.

**The bench re-cut** (`match/test/blastBroadPhaseBench.devdisc.test.ts`; not yet run): the line is timed ALONE, each
from its own start (nothing shared); the blast is the worst a round can hold by the game's own limits -- every seat of
the room (`MAX_PLAYERS` 16, viewer `net/protocol.ts`; the game's MP limit, research 91) and every escortee the map
lists, both lines each; for every seat ALL THREE of a kit's charges -- C4 (its capacity x mags off the disc's kit
table), claymores at most `CLAYMORE_RULES.maxPlaced` (4 an owner: `FUN_003cc1f0(...) < 4`, D:L475306-475308, a count of
claymores alone) and the PMN's whole ring (its own fire asks the same count of claymores, D:L475338-475340) -- a kit
holding each once (`NO_DUPLICATE_ITEMS_READING`, research 378 s2) in its three equipment slots; every destructible of
the map. Which side the maps' valves let carry which mine is not taken off. All of it inside one radius is an upper
bound no round reaches. The first cut's 32-charge blast is printed beside it, not gated. Both gates are asserted, each
on its own.

**The review of 79d589a7e0** (a fresh reviewer, reading only, with the decompilation; hub
`reviews/wm-29-hub-review-f294acd1ce.md`): PASS WITH FINDINGS. By name -- *are the sums the same expressions on the same
numbers, for every polygon, in both modes*: every decision, every non-zero value and every `accept` call the same in
all three paths; ONE difference, the sign of a zero -- the start was matched by `===`, and +0 === -0, so a start at -0
after one at +0 took the other's sums and a hit's t and point carried the other zero's sign (no hit gained, lost or
re-ordered). Folded RED first: `segmentBlastRule.test.ts`, "a start at -0 after a start at +0" -- 1 failed | 19 passed
against `===`, then the start matched by `Object.is` on its three numbers. Its finding 1: the re-cut bench took the
larger of the two mines a seat and so left 16 x min(claymores, PMN) lines out -- corrected above (all three). Its
finding 2: no test told two starts a hair apart from one -- added ("two starts 2e-13 apart on either side of a band's
edge"). Named, not tested: the depth counter's `finally` (a query left counted after an `accept` that throws would only
make later queries reckon their own sums -- slower, not wrong).

## 8. The original's walk: the cells and the node boxes (LATER 1094)

Added 2026-11-18 by the hostages seat, on the main controller's order after the review of 79d589a7e0 FAILED (medium): B
pinned hits the original very probably does not have (s7.2 cases 4 and 9), because the original walks only the cells a
line marks and refuses a node by its box. Evidence kinds, kept apart: **(D)** the decompilation at
`$SOCOM_PC_ROOT/game/analysis/socom2_game.elf.decomp.c` read on the hub, and the ELF's instructions where Ghidra drops
arguments (`dist/socom2_game.elf`, read with a disassembler; cited by address); **(U)** unit tests on the hub (one file
or a short list; s8.5). Nothing here is measured on the original running. **Reading, pending review.**

### 8.1 What the original asks of a segment record

1. **The batch.** A blast line is queued as a type-2 record (`FUN_003c7ee0` -> `FUN_0031dd90`, D:L219870-219900; one
   line per call). The queue is flushed by `FUN_0031de30` (D:L219905-219911) into `FUN_002d3cf0`, and `FUN_0031de30` is a
   periodic task (registered at D:L152100): **one batch a frame**, holding every record queued that frame (each body's
   step, each round's line, each blast's line; research 422 s2.6).
2. **The cells a record marks.** For a type-2 record `FUN_002d3cf0` calls `FUN_002d6800` (D:L175582) with the count 2 and
   the flag 1. Ghidra prints the call with two arguments; the instructions set `$a2` = 2 at 0x2d41a8 and `$a3` = 1 at
   0x2d4178. `FUN_002d6c40` sets the line up: each end's cell is `(int)(invCellDim x ((p - origin) + 0.0001))`, clamped to
   0..n-1, on x and on z (D:L177260-177297). `FUN_002d6800` gives the two edges a->b and b->a their unit normals in x-z
   (D:L177104-177111; a line with both ends at one x-z point keeps normals of 0). Every cell of the ends' cell box is
   offered (`FUN_002d6430`, x outer and z inner), and `FUN_002d66b0` refuses one whose centre lies more than `grid+0x40` from the line, on
   either side (D:L177059-177067: below `-grid+0x40` on either edge, or, with the flag set, above `+grid+0x40`).
   `grid+0x40` is half a cell's diagonal: 127.279 on 180-unit cells and 113.137 on 160-unit cells (research 204, from
   the dumps; the writer of the field is not found, so the formula is inferred: `GRID_COVER_HALF_WIDTH_READING`).
3. **The objects.** The marked cells are walked z outer, x inner (D:L175612-175720). Each atom is walked once a batch
   (its `+0xa4` against the batch's count, D:L175631). A clutter instance hangs on EVERY cell its box covers, through each
   cell's own holder, so it is walked once per marked cell it is filed in, and each walk can add its hits again
   (D:L175353-175371; `BLAST_CLUTTER_PER_CELL_READING`). A cell's clutter vector is walked through each instance's
   model (`+100`) with the instance's matrix pushed (D:L175692-175703), then the atom's object itself (D:L175709-175710).
   The cell's mask of records is loaded (D:L175621) but not applied: the instructions at 0x2d30c0-0x2d30e8 test
   `1 << i` alone, which is never 0 (Ghidra prints the same). So **every object of every marked cell is offered to every
   record of the batch**, not only to the records that marked its cell.
4. **The node box.** `FUN_002d3030` on each node: the record whose target is the node is done for it (D:L175078); the
   node's matrix is pushed and the stack's top inverted (D:L175103-175108) by `FUN_00308160` (D:L206756-206800, VU0):
   Q = 1 / |the first row|^2, the 3x3 transposed times Q, the translation carried through it -- the inverse for a turn
   times a uniform scale, and something else for any other frame. For a type-2 record the two ends are put into
   that frame (`FUN_003085c0`, D:L175248), and `FUN_003124f0` (D:L213172-213241, called at D:L175249) refuses the record
   when both ends lie strictly below a face's minimum or strictly above its maximum on one axis of the node's `+0x40..+0x54`
   box. The box is the file's `nparams` bbox (the node readers copy it; scene `clutter.ts`, "a coherent bbox at +64").
   With the node's flag bit 30 set (`+0x5f` bit 6), nothing is refused (D:L213184). A refused record is done until that
   node's walk ends (D:L175396-175402), so it is refused for the node's whole subtree; a node whose every record is done is
   not walked into (D:L175102).
5. **Filing.** A world node is filed by its box carried into the world by two corners (research 23 s2.1; scene
   `grid.ts` `worldFootprint`). A world instance node is the model's copy -- one node, with the instance node's own box
   and frame (reCOM's `CreateInstance` then `ReadDataBegin`; `INSTANCE_NODE_BOX_READING`). A clutter instance is filed by its master root's box, each corner times 1 / `scale_inverse`
   plus the instance's translation, not turned (`FUN_002d55c0`, D:L176288-176344; research 422 s3), its cells by
   `FUN_002d6c40`'s rule with its +0.0001 (through `FUN_002d6ab0`, D:L176344). For a root with bit 30
   the box is `FUN_00262550`'s, unread (`CLUTTER_FREE_ROOT_BOX_READING`).

### 8.2 What the port builds

- `CollisionOwner.nodes`: the chain of node boxes from the filed node down to the owner's own node, each with its frame
  and bit 30. It comes from `collisionOwners` (the worldmodel's children are the filed nodes, so the root is not on the
  chain) and from `clutterCollision` (the master's root down, each frame through the instance's matrix).
  `CollisionOwner.filed` is the filed node's footprint.
- `segmentHits`' blast modes (`blastHits`) ask the rule only of the owners in the cells the line marks (`blastCells`, every
  step in float32), filed by `filed`, each once, whose chain no box refuses (`nodeRefuses`). The rule itself, the kept sums
  and the order of an owner's polygons are unchanged. B (the rule of every polygon of the grid) is the oracle (s8.5).
- The cells are reckoned in float32 with every step chopped toward zero, as the EE rounds (`chopF32`, research 25), the
  cell's centre added as the instructions add it, half + (origin + i x cell) (0x2d670c-0x2d6744). The dot product and the
  normals' squared lengths are fused multiply-adds on the EE (`mula.s` + `madd.s`, 0x2d6770-0x2d6774, 0x2d68a0-0x2d68a4,
  0x2d6a10-0x2d6a14); how the EE rounds inside them is not read (`BLAST_COVER_MADD_READING`).
- A node's frame is inverted as `FUN_00308160` inverts it (s8.1 4), not by a general inverse.
- An instance node and the model root realised under it (`flattenScene`'s `X=model`) are one entry on the chain, the
  instance node's.
- A Forge copy (a placed gate, barrier, switch look, turret or door) carries its template's chain moved by its own matrix
  and is filed where it stands (`movedWalk`). A copy stands as a world node; the original has no such copy to read.
- The default path (`frontOnly` true or false) is untouched.

### 8.3 Cases 4 and 9 re-pinned

- **Case 4** (not planar): the third review's quad moved 20 along x (vertices and box x 25..75), a line at x 7.07. The rule
  hits it at x 7.07, on the plane through the last vertex. The line's cell is the owner's; **the node box refuses it**,
  because both ends lie below the box's x minimum. No hit, in both modes. With bit 30 set, B's hit is let through.
- **Case 9** (the cells): the same hit point (-12.93, 32.07, 5), by a line from (7.07, 32.07, -15) to (-32.93, 32.07, 25).
  Its ends straddle the box's x and z minima, so the box lets it through. On 10-unit cells its x-z path passes outside
  the box's corner (5, 0), and no cell it marks is one the owner is filed in. **No hit.** On 100-unit cells it marks the
  owner's cell, and the hit is found.
- In s7.2, rows 4, 5 and 9: the original does not bound the rule's region either. It refuses by cells and node boxes,
  which s8 builds.

### 8.4 Readings

| Name | Where | Level | What |
|---|---|---|---|
| `GRID_COVER_HALF_WIDTH_READING` | scene `segment.ts` | reading, pending review | `grid+0x40` taken as f32(f32(cellDim / 2) x f32(sqrt 2)). The VALUES are read from the dumps (research 204: 127.279 on 180-unit cells, 113.137 on 160), and the formula gives both. The field's writer is not found in the decompilation. What would settle it: that writer, or the field in a dump of every map's grid. |
| `BLAST_BATCH_CELLS_READING` | scene `segment.ts` | reading, pending review | `'the line's own cells; the frame's other records' cells not added'`. The original's batch is a frame's every record (s8.1 1, 3), and an object in any marked cell is offered to every record. The port walks the line's own cells. A line can meet an owner the original found through another record's cell, where the node box lets it pass (both ends not beyond one face) and the line crosses the rule's region outside its own cells. What would settle it: building the frame's batch in the room (every body step, round line and blast line of a tick together), a design question for the owner of the room's tick. |
| `BLAST_SWEEP_NODE_BOX_READING` | scene `segment.ts` | placeholder | `'no node box asked of a moving owner'`. A door, gate or crane (`sweep`) has its points rewritten in place, and the port keeps no live frame for its node, so its box is not asked. It is filed by its polygons and swing (`sweep`), as the default path files it. What would settle it: the moving node's live matrix carried beside its points. |
| `INSTANCE_NODE_BOX_READING` | scene `grid.ts` | reading, pending review | `'the instance node's own box and frame; the realised model root not a node of its own'`. The engine copies a world instance's model into the instance node (reCOM `zNode/node_io.cpp:46-51`, `node_saveload.cpp:49-74`), so the chain holds the instance node and not the realised root. That the copy keeps the instance node's box rather than the model root's is read from reCOM's order, not from the decompilation. What would settle it: the instance read in the decompilation, or a census of instance nodes whose box differs from their model root's (the review of fc0cb0622b, S2: 65 top-level instances on Frostfire). |
| `BLAST_CLUTTER_PER_CELL_READING` | scene `segment.ts` | reading, pending review | `'each owner asked once a line'`. The original walks a clutter instance once per marked cell it is filed in (s8.1 3), and each walk can add its hits again. The blast keeps an owner's first offered polygon (`REACH_HITS_READING`), so no blast result changes; a consumer counting every hit would. What would settle it: none needed for the blast; a census of what else reads the hit list. |
| `BLAST_COVER_MADD_READING` | scene `segment.ts` | reading, pending review | `'each product and the sum chopped apart'`. `FUN_002d66b0`'s dot product and `FUN_002d6800`'s squared lengths are fused multiply-adds (`mula.s` + `madd.s`); how the EE rounds inside them is not read, and the port chops each product and the sum apart. A cell centre within float32's last place of the half-width could be marked by one and not the other. What would settle it: the EE's `madd.s` rounding (an emulator's or the manual's), then a search for an input it changes. |
| `FORGE_COPY_POLY_CELLS_ADAPTATION` | scene `segment.ts` | adaptation (no original) | `'a Forge copy is found in its polygons' cells as well as its filed node's'`. A Forge copy (`movedWalk`) is filed by its first node's box by two corners, which for a copy turned near 45 degrees misses cells its polygons stand in, so a blast line there would pass a placed barrier. The main controller's yes (2026-11-18, the second review's F1): a copy is also found in its polygons' cells. World nodes and clutter keep the original's filing. Tested in `blastWalkChain.test.ts` (the review's 45-degree input). |
| `CLUTTER_FREE_ROOT_BOX_READING` | scene `clutterCollision.ts` | reading, pending review | `'the root's own nparams box'`. A clutter root with bit 30 is filed by `FUN_00262550`'s box (D:L176298-176300), unread; the port files it by its own box. Whether any clutter root on the disc has bit 30 is not counted. What would settle it: that count (a census line), and `FUN_00262550` if any does. |

Also named, not built: the port puts a line's ends into a node's frame in doubles, where the original inverts and
transforms in float32. A line within float32's rounding of a face can be refused by one and not the other. The
`+0x40` box is taken as the file's `nparams` box unchanged after load (not traced).

### 8.5 The tests (U, on the hub)

- RED at 316de4881b (B; the new tests on the old source): `segmentBlastRule.test.ts`, 6 failed and 16 passed. The two
  re-pinned cases, the frame-and-chain case, the walk's 600-line sweep, and the two sweeps that already compared with the
  oracle failed: with the walk-filtered oracle, B gives hits the walk refuses. Log on the hub:
  `ffblast/red-1094-segmentBlastRule-at-316de4881b.log`.
- GREEN with the walk: 22 passed. The oracle is B's rule filtered by a transcription of the walk written in the test,
  apart from `segment.ts`: the cells in float32, and the box in the node's frame. Beside it, unchanged and green on the
  hub: scene `clutterCollision`, `grid`, `segment` (63 tests with this file); viewer `blastExposedZeroDistance`,
  `blastExposure388`, `blastLine416`, `sceneHealth`, `accessBarriers`, `grenade` (173 passed, 10 skipped: those files'
  own skips, not counted).
- Owed on a box: the typecheck, the bench (`blastBroadPhaseBench.devdisc`), the dev-disc C4 test, the viewer and match
  wholes; then a fresh review.

### 8.6 The review of fc0cb0622b, and its fold

A fresh `reviewer` (hub `ffblast/review-1094-fc0cb0622b.md`) gave a **FAIL**: one blocking finding, four to fix and five
notes. It confirmed at the source:
- the type-2 call's count 2 and flag 1 (the instructions);
- that the mask is not applied;
- the node box (strict, bit 30, subtree);
- the clutter walk from the master root;
- `clutterFiled`.

The fold, at the next commit:
- **B1 (blocking)**: the Forge's copies spread their template's `nodes` and `filed`, so a placed barrier or turret was
  filed and boxed where its template stands and a blast passed through it. The copies now carry the chain moved by the
  copy's matrix (`movedWalk`; `placedAccess.ts` twice, `placedDoors.ts`, `turrets.ts`), tested in
  `blastWalkChain.test.ts`.
- **S1**: the node frame's inverse is `FUN_00308160`'s (s8.1 4). A frame diag(2, 1, 1) is the test.
- **S2**: an instance node and its realised model root are one chain entry (`INSTANCE_NODE_BOX_READING`).
- **S3**: the production chain and filing code is tested (`blastWalkChain.test.ts`: the chain and its root, bit 30, the
  instance merge, clutter's frames and filing, the cover rule's edge, `movedWalk`). The test's transcription now follows
  the original's rounding and inverse. It is still a transcription by the same reader (named).
- **S4**: named (`BLAST_CLUTTER_PER_CELL_READING`).
- **N1**: the chop.
- **N2**: the clutter filing's cover rule (`filedByCover`).
- **N3**: the marking order in the comments.
- **N4, N5**: no change.

Not checked by the reviewer, and not by this seat: that `FUN_0031de30` runs exactly once a frame, and that the `+0x40`
box is the file's box unchanged after load.

### 8.7 The second review (of c75d067ce9), and its fold

A second fresh `reviewer` (hub `ffblast/review-1094-c75d067ce9.md`) gave **PASS WITH FINDINGS** (confidence medium: it
ran only the scene files and the ledger, 49 passed, because the hub's memory was low).

Every finding of s8.6 it judged fixed at the source:
- B1, through `multiply`'s order and three.js's `elements`, at every copy site;
- S1, `FUN_00308160` decoded by hand at 0x308160-0x3081fc;
- S2, reCOM's `node_io.cpp:46-49` gives the instance its own matrix and box;
- S3, S4, N1, N2, N3.

The fold, at the next commit:
- **F2**: the fused multiply-adds named (`BLAST_COVER_MADD_READING`).
- **N-a**: the cell's centre added in the instructions' order.
- **N-c**: the clutter filing chopped in float32.

Not folded:
- **F1**, for the main controller (product track: a Forge copy has no original) -- **folded on its yes**
  (`FORGE_COPY_POLY_CELLS_ADAPTATION`, s8.4).
  The finding: A copy is filed by its first node's
  box carried by two corners, which at 45 degrees is narrower than its polygons. So a blast line whose cells hold only
  the copy's polygon ends, outside that footprint, is never offered the copy. The engine's own rule for a turned world
  node does the same; the choice is whether a copy should also be found in its polygons' cells.
- **N-b**: `flattenScene` still multiplies a prototype root's matrix into its children's frames, where the engine
  replaces it with the instance's. That is harmless only if every prototype root's matrix is the identity; not
  counted, and older than this work.
