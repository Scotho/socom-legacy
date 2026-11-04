# Camera motion timing follow-up

Product adaptation, new task base UI `ffac65f36`. The original sampler author owns only shot.ts and its test.
Claude owns the frame driver/page/protocol/security. This document authorizes source/test preparation only;
retained actual assertion RED and a guarded host slot precede functionality.

Claude18:03 accepted the corrective module for integration and assigned these follow-ups:

- Name `CAMERA_SAME_POINT_UNITS_ADAPTATION = 1e-3` world units. Near-repeat authored eyes count as the same
  point for tangent-zeroing and leg classification. Do not discard distinct authored endpoints or introduce
  hidden position jumps; numerical equivalence is an adaptation, not original-game camera behaviour.
- Every leg with a look change gets timing weight at least its virtual angular arc: max(spatial length,
  radians times2 metres/radian converted using the explicit map scale). A tiny translation must not collapse
  a substantial turn into one frame. The same global timeline drives translation and orientation.
- Preserve one global ease, shared C1 translation at joins, no ordinary waypoint stop, exact endpoints/hold,
  owned outputs, strict input refusal and bounded work. Independent weighted legs change their spatial rate;
  Claude18:08 confirmed nonzero shared boundary-rate reconciliation across angular-heavy/spatial-heavy joins;
  angular weight is counted once per authored leg, including legs split internally at a cusp.
- Canonical protocol bound objects are now present on this base; reuse them without editing protocol or
  changing values. No prepared-shot cache/API, new coordinate cap, DOM, camera, player or world access.

Tests cover near-repeat float arithmetic and tolerance boundaries; moving/turning tiny legs; output orientation
continuity at frame samples; mixed angular-heavy and spatial-heavy ordinary joins with shrinking-window velocity
and nonzero speed; old cusp/pan/antipodal/extreme fail-closed cases. Preserve all68 existing cases. No rendered
performance, capture or complete camera feature claim follows from unit/source results.

## Log

- 2026-10-25T18:05:48Z -- Published base confirmed, script-made isolated tree. Pure sampler follow-up claims
  preserved; install/allowlist request sent to Claude, neither done. Source-only regression preparation next.

- 2026-10-25T18:27:56Z -- Same original author prepared 75 cases (old68 retained); fresh preparation SOURCE PASS high.
  Test blob 66f4782f72b1f516b08d262ed7e00f94a2d0c123; source unchanged c4a1a31bd.
  Claude18:08 install grant is recorded; exact root added to reviewed shared runner/fixed installer policy.
  Install NOT DONE and actual RED/GREEN/typecheck NOT RUN: measured free memory below unchanged5GiB floor.
  No functional correction, rendered Frostfire proof or full-feature acceptance claimed.
- 2026-10-26T06:19Z -- **The correction `d42788634` (the author's, committed as found after its session was lost) and its runs**,
  recorded by the UI seat: RED against main's `shot.ts` (`58397cc74`, v0.2.0): 5 failed, 70 passed of 75 -- the three
  near-repeat cases (1e-14, 0.0005, 0.000999), the short translating turn, the mixed join; the two threshold-boundary cases
  passed before the fix too (they pin the boundary). GREEN with the correction, `origin/main` merged (`174a221dd`):
  cameraShot 75/75, cameraDriver 12, cameraSettle 5, pageCamera 10, agentForgeTarget 22, forgeAgentCamera 11, forgeAgentPage
  15; tsc viewer 0 (the seat runner, single files). Fresh review (Opus, read-only, the author's own review could not be
  given): PASS WITH FINDINGS, medium-high -- the correction changes timing only (near-repeat eyes zero both tangents and are
  not searched for cusps; a leg's time weight is the larger of its distance and its turn, counted once per authored leg;
  join slopes stay in [0, 1]); the batch's stop-and-turn behaviour and the numerical guard are kept; the min/max bounds are
  read from the protocol's `CAMERA_SHOT_*_ADAPTATION` (values unchanged). One behaviour note: the overflow refusal
  (`camera.NUMERICAL_GEOMETRY`) now applies to every turning leg, not only stationary pans -- a map scale near 1e-308 with a
  turning leg is refused instead of played; no map has such a scale and refusing is the safe direction.
