import { beforeAll, describe, expect, it } from 'vitest';
import { parseZdb, zdbMember } from '@s2u/archive';
import { ITEM, parseAiMaps, readKitTable, zoneContains, zonesOfKind } from '@s2u/scene';
import { fixture } from '../../archive/test/fixtures';
import { simClipsFromBytes, simMapFromBytes } from '../../viewer/src/simMap';
import { DoorSet } from '../../viewer/src/doors';
import { groundPolygons, Walker } from '../../viewer/src/mover';
import { Traversal } from '../../viewer/src/traversal';
import { ROOM_SKIP_EFFECTS_READING, WorldState } from '../../viewer/src/worldState';
import { FOLLOW_RULES_READING, FollowTrail, HostageFollow, type FollowLeader } from '../src/hostageFollow';
import { HostagePathPlanner } from '../src/hostagePath';
import { HostageObstacles } from '../src/hostageObstacles';
import type { HostageActor } from '../src/hostageActors';
import { ESCORT_ZONES_READING } from '../src/extraction';
import { planFixtureLeaderRoute } from './helpers/hostageLeaderRoute';
import { sampleFixtureLeader } from './helpers/hostageLeaderSample';

// Test adaptation: a scripted leader steers a real Walker along the disc-derived route in XZ, waiting
// when the follower is more than 100 world units behind. Both bodies use physical floor/collision;
// stored AI-cell altitude never lifts the leader onto an overlapping roof. Only the leader is scripted; the follower
// starts at its authored spawn and uses the real AI map, collision hull and production movement.
// The fixture opens unlocked doors and breaches authored access barriers before departure.
// Damage comes from the disc C4 record through SceneHealth and the authored death programs.
// Charge placement/arming and the player's approach are outside this fixture. This is cleared-route coverage, not
// evidence of door interaction, player traversability, original-game parity or rendered movement.
const weapons = fixture('RUN/ZWEAPON.ZAR');
const motion = fixture('RUN/MOTION_P.ZAR'), reader = fixture('RUN/READERC.ZAR');
const clips = motion && reader ? simClipsFromBytes(motion, reader) : null;
const DT = 1 / 30, LEADER_SPEED = 45, MAX_LEAD = 100, STALL_TICKS = 300, MAX_TICKS = 18000;
const gap = (a: readonly number[], b: readonly number[]) => Math.hypot(a[0]! - b[0]!, a[2]! - b[2]!);
// Test-only route planning: sample real Walker moves around an AI waypoint that a player cannot
// occupy. Probe walkers are disposable; the actual leader replays every returned segment through
// normal movement, and the follower is never moved by this search. Limits are fixture budgets.
function detour(map: ReturnType<typeof simMapFromBytes>, from: number[], targets: readonly (readonly number[])[]) {
  type Node = { at: number[]; parent: Node | null; cost: number; score: number };
  const heuristic = (at: number[]) => Math.min(...targets.map(t => gap(at, t)));
  const open: Node[] = [{ at: from, parent: null, cost: 0, score: heuristic(from) }], visited = new Map<string, number>();
  const key = (p: number[]) => `${Math.round((p[0]! - from[0]!) / 5)},${Math.round(p[1]! / 5)},${Math.round((p[2]! - from[2]!) / 5)}`;
  visited.set(key(from), 0);
  for (let count = 0; open.length && count < 4000; count++) {
    open.sort((a, b) => b.score - a.score);
    const node = open.pop()!;
    if (node.cost > visited.get(key(node.at))!) continue;
    const reached = targets.findIndex(t => gap(node.at, t) < 4);
    if (reached >= 0) {
      const path: number[][] = [];
      for (let n: Node | null = node; n?.parent; n = n.parent) path.push(n.at);
      return { path: path.reverse(), reached };
    }
    for (const [dx, dz] of [[-5, 0], [5, 0], [0, -5], [0, 5], [-5, -5], [-5, 5], [5, -5], [5, 5]]) {
      const end = [node.at[0]! + dx!, node.at[1]!, node.at[2]! + dz!];
      if (gap(end, from) > 200) continue;
      const probe = new Walker(map.grid);
      if (!probe.place(node.at[0]!, node.at[1]!, node.at[2]!)) continue;
      for (let step = 0; step < 5 && !probe.airborne; step++) probe.glide(dx! / 5, dz! / 5);
      if (probe.airborne) continue; // Search only walks; the actual player's offered climbs are separate.
      const at = [probe.state.x, probe.state.y, probe.state.z];
      if (gap(at, end) > 0.5) continue;
      const cost = node.cost + Math.hypot(dx!, dz!), k = key(at);
      if ((visited.get(k) ?? Infinity) <= cost) continue;
      visited.set(k, cost); open.push({ at, parent: node, cost, score: cost + heuristic(at) });
    }
  }
  return null;
}
// Research 192 §1 / READERC.ZAR missionlist.rdr: the four EXTRACTION and three ESCORT maps.
// Extraction walks to every kind-1 zone. Escort walks to each script's staging/extraction region:
// research 175 §4 (MP52 Rescue1 @3764, MP53 @3796, MP82 @3696), held against the script's
// corner words by central/test/escort.test.ts. The tiny initial kind-1 zones need not be traversable.
// The promotion/countdown itself remains separate coverage in central/test/escort.test.ts.
// VIP physical routes are an opt-in diagnostic expansion while Guidance terrain remains unresolved
// (LATER590). Keep every row registered so normal runs report skips, never all-map acceptance.
for (const stem of ['MP6', 'MP10', 'MP11', 'MP71', 'MP52', 'MP53', 'MP82']) {
  const bytes = fixture(`RUN/${stem}.ZDB`);
  const ai = bytes ? parseAiMaps(zdbMember(bytes, parseZdb(bytes), 'AIMAPS.MPS')) : null;
  const escortZones = ESCORT_ZONES_READING[stem]?.stage;
  const authoredTargets = ai ? (escortZones
    ? ai.maps.flatMap(sub => sub.zones).filter(zone => escortZones.includes(zone.name))
    : zonesOfKind(ai, 1).map(({ zone }) => zone)) : [];
  const targetZones = authoredTargets.length ? authoredTargets : [null]; // Missing data skips; missing regions fail.
  const vipAuditSkipped = !!escortZones && process.env.S2U_HOSTAGE_VIP_TRAVERSAL !== '1';
  const auditStatus = escortZones ? ` (VIP audit ${vipAuditSkipped ? 'skipped; enable S2U_HOSTAGE_VIP_TRAVERSAL=1' : 'enabled'}; Guidance terrain/LATER590 unresolved)` : '';
  describe.skipIf(!bytes || !weapons || !clips || vipAuditSkipped)(`${stem} physical hostage traversal (dev-disc)${auditStatus}`, () => {
    let map: ReturnType<typeof simMapFromBytes>;
    beforeAll(() => {
      map = simMapFromBytes(bytes!, `RUN/${stem}.ZDB`);
      expect(map.escortees).toHaveLength(3);
      expect(targetZones.every(Boolean), `${stem}: an authored rescue target is required`).toBe(true);
      if (escortZones) expect(authoredTargets.map(zone => zone.name).sort()).toEqual([...escortZones].sort());
      const doors = new DoorSet(map.doors ?? [], map.ground);
      const world = new WorldState(map.meta!, map.ground, map.grid);
      world.skipEffects = ROOM_SKIP_EFFECTS_READING;
      world.applyInitial(); // As Room does: raw good/broken meshes are not all active together.
      const c4 = readKitTable(weapons!).throwables!.get(ITEM.C4)!;
      // Select by authored action linkage, never by a map-specific polygon-name exception.
      const barriers = world.health.list.filter(d => d.program.sequences.some(seq => seq.ops.some(op =>
        op.op === 'executeAction' && map.meta!.actions.some(a => a.typeCode === 8 && a.valve.toLowerCase() === op.anim.toLowerCase()))));
      for (const barrier of barriers) {
        expect(world.isActive(barrier.targetPath), `${stem}: barrier starts intact`).toBe(true);
        const point = world.placeOf(barrier.targetPath);
        expect(point, `${stem}: barrier has collision geometry`).not.toBeNull();
        expect(world.health.hitAt(barrier.targetPath, { kind: 'explosion', rating: c4.record.explosionDamage,
          modifier: c4.record.damageModifier ?? 0, piercing: c4.piercing, point: point! }).died,
        `${stem}: disc C4 must trigger the authored breach program`).toBe(true);
      }
      for (let i = 0; i < (map.doors?.length ?? 0); i++) if (!doors.state(i).open) doors.use(i);
      for (let i = 0; i < 600; i++) { doors.step(DT); world.step(DT); }
      for (const barrier of barriers) expect(world.isActive(barrier.targetPath), `${stem}: breached collision is inactive`).toBe(false);
    });
    for (const startIndex of [0, 1, 2]) for (const [zoneIndex, targetZone] of targetZones.entries()) {
      it(`spawn ${startIndex + 1} physically reaches extraction zone ${zoneIndex + 1}`, () => {
        const start = map.escortees![startIndex]!, zone = targetZone!;
        const obstacles = new HostageObstacles(), planner = new HostagePathPlanner(map.ai!, obstacles);
        // A geometric zone centre can be nonwalkable (Fish Hook Safety). Select the
        // nearest authored traversable cell, in stable row order, without changing the map.
        const centre = { x: zone.corner.x + (zone.width >> 1), z: zone.corner.z + (zone.height >> 1) };
        const candidates = Array.from({ length: zone.width * zone.height }, (_, i) => ({
          map: zone.corner.map, x: zone.corner.x + i % zone.width, z: zone.corner.z + Math.floor(i / zone.width),
        })).filter(p => planner.traversable(p)).sort((a, b) =>
          Math.hypot(a.x - centre.x, a.z - centre.z) - Math.hypot(b.x - centre.x, b.z - centre.z));
        expect(candidates.length).toBeGreaterThan(0);
        const target = candidates[0]!;
        // Test-only human-leader itinerary. MP53/MP82 full crossings exceed the original closed
        // capacity (24577 pops, cap24576), although short FOLLOW legs use that capacity normally.
        // Keep the original planner first (the existing extraction/Mixer routes); fallback only
        // supplies the leader's points, never a follower route or an altered gameplay limit.
        const authored = planner.plan(start.loc, target);
        const fallback = authored ? null : planFixtureLeaderRoute(planner, start.loc, target, 150000);
        const route = authored ?? (fallback ? { points: fallback, cost: 0 } : null);
        expect(route, `${start.name}: no route to ${zone.name}`).not.toBeNull();
        // Continue inside the zone after its centre, so the original trailing formation and
        // arrival radius do not leave the follower outside a narrow zone (MP6). This is a
        // bounded fixture path choice, not a change to FOLLOW's spacing or rescue rules.
        const previousCell = route!.points.at(-2) ?? start.loc;
        const dx = target.x - previousCell.x, dz = target.z - previousCell.z, length = Math.hypot(dx, dz);
        let runway = target;
        for (let n = 1; length > 0 && n <= 8; n++) {
          const candidate = { ...target, x: target.x + Math.round(dx / length * n), z: target.z + Math.round(dz / length * n) };
          if (!zoneContains(zone, candidate) || !planner.traversable(candidate) || !planner.canTravel(target, candidate)) break;
          runway = candidate;
        }
        const points = [start.at, ...route!.points.map(p => planner.point(p)), planner.point(runway)];
        const actorViews = (): HostageActor[] => [
          { id: leader.id, alive: true, cell: obstacles.actorCell(leader.id), velocity: [leaderWalker.state.vx, leaderWalker.state.vy, leaderWalker.state.vz],
            position: leader.feet, rawCell: planner.locate(leader.feet), ai: false, stance: leader.stance, excluded: false, yieldTo: null, probeRefused: false },
          { id: 240, alive: true, cell: obstacles.actorCell(240), velocity: follower.bodyVelocity,
            position: follower.feet, rawCell: planner.locate(follower.feet),
            ai: true, stance: follower.stance, excluded: false, yieldTo: follower.yieldTo, probeRefused: false },
        ];
        const follower: HostageFollow = new HostageFollow(planner, map.grid, [...start.at], start.yaw, map.defaultMaterial, clips,
          { id: 240, actors: actorViews }), trail = new FollowTrail();
        const leaderWalker = new Walker(map.grid);
        leaderWalker.place(...start.at);
        const leaderMoves = new Traversal(map.grid, groundPolygons(map.ground));
        leaderMoves.setClips(clips!.clips, clips!.table);
        leaderWalker.actionRoots = clips!.roots;
        leaderWalker.driver = leaderMoves;
        const leader: FollowLeader = { id: 1, feet: [...start.at], yaw: 0, velocity: [0, 0, 0], topSpeed: 65, stance: 0 };
        let segment = 1, stalled = 0, anchor = follower.feet, reached = false;
        let leaderStalled = 0, leaderAnchor = [...start.at];
        let bypass: number[][] = [], bypassResume = 0, detours = 0;
        for (let tick = 0; tick < MAX_TICKS; tick++) {
          const moving = segment < points.length && gap(leader.feet, follower.feet) < MAX_LEAD;
          const body = leaderWalker.state;
          // Test driver presses the existing player action only when the real contact offers it.
          if (moving && leaderMoves.climbPrompt()) leaderMoves.action();
          if (moving && !leaderMoves.busy()) {
            const next = bypass[0] ?? points[segment]!, dx = next[0]! - body.x, dz = next[2]! - body.z;
            if (dx || dz) leader.yaw = Math.atan2(-dx, -dz) * 180 / Math.PI;
            body.yaw = leader.yaw;
          }
          // Use the normal input/tick lifecycle so contact records, climb gates, falls and
          // velocity carry run exactly as for a player. Steering the input is the adaptation.
          leaderWalker.tick({ forward: moving ? LEADER_SPEED / 65 : 0, right: 0, boost: false }, DT);
          leader.feet = [body.x, body.y, body.z];
          // Five-unit test waypoint tolerance: a physical capsule need not occupy an exact
          // cell centre beside a jamb. This only advances the aim; it never bypasses collision.
          if (bypass.length) {
            if (gap(leader.feet, bypass[0]!) < 1) bypass.shift();
            if (!bypass.length) segment = bypassResume;
          } else if (segment < points.length && gap(leader.feet, points[segment]!) < 5) segment++;
          if (!moving || gap(leaderAnchor, leader.feet) >= 1) { leaderAnchor = [...leader.feet]; leaderStalled = 0; }
          else leaderStalled++;
          if (leaderStalled === 60 && !bypass.length && detours < 8) {
            const alternate = detour(map, [...leader.feet], points.slice(segment, segment + 8));
            if (alternate?.path.length) {
              bypass = alternate.path; bypassResume = segment + alternate.reached + 1; detours++;
              leaderStalled = 0; leaderAnchor = [...leader.feet];
            }
          }
          if (leaderStalled >= STALL_TICKS) throw new Error(`fixture leader cannot traverse authored route: ${JSON.stringify({
            stem, spawn: start.name, zone: zone.name, tick, segment, next: route!.points[segment - 1],
            leader: leader.feet, follower: follower.feet, climb: leaderMoves.climbPrompt(),
            contacts: [...new Set(leaderWalker.wallHits().map(h => h.poly.path))],
          })}`);
          const cell = sampleFixtureLeader(body, leader, planner, trail, DT);
          expect(cell, 'scripted leader left the authored AI map').not.toBeNull();
          // Same retained-cell occupancy binding as ExtractionAuthority; both bodies remain physical.
          if (planner.traversable(cell!)) obstacles.moveActor(leader.id, cell!);
          const followerCell = planner.locate(follower.feet);
          if (followerCell && planner.traversable(followerCell)) obstacles.moveActor(240, followerCell);
          follower.step(DT, leader, trail, 0);
          const movedCell = planner.locate(follower.feet);
          if (movedCell && planner.traversable(movedCell)) obstacles.moveActor(240, movedCell);
          expect([...follower.feet, ...follower.velocity].every(Number.isFinite)).toBe(true);
          const at = planner.locate(follower.feet);
          if (at && zoneContains(zone, at)) { reached = true; break; }
          if (trail.length < FOLLOW_RULES_READING.trailStart || gap(anchor, follower.feet) >= 1) {
            anchor = follower.feet; stalled = 0;
          } else stalled++;
          if (stalled >= STALL_TICKS) throw new Error(JSON.stringify({ stem, spawn: start.name, zone: zone.name,
            tick, segment, next: route!.points[segment - 1], follower: follower.feet, leader: leader.feet,
            location: at, sub: follower.sub, goal: follower.goal, velocity: follower.velocity, traversal: follower.traversalPose }));
        }
        expect(reached, `exceeded bounded traversal time: ${JSON.stringify({ stem, spawn: start.name, zone: zone.name,
          segment, next: points[segment], bypass: bypass[0], detours, leader: leader.feet, follower: follower.feet,
          location: planner.locate(follower.feet), sub: follower.sub, goal: follower.goal, velocity: follower.velocity, traversal: follower.traversalPose,
        })}`).toBe(true);
      // Full-route 18000-tick failures plus physical detour planning measured up to 38 seconds.
      }, 60000);
    }
  });
}
