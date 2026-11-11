/**
 * Authored multiplayer bot extension (FBA.R5, FBA.R8), ported from the preserved SOCOM practice-bot snapshot
 * source-20261020T223735Z. Decisions and tuning are ours, not recovered retail campaign behaviour. Existing
 * Redotcom movement, collision, weapon cone, damage, reload and animation implementations remain authority.
 */
import { aiCellCentre, isLiquidSurface, probeFloor, probeGround, segmentHit, surfaceWord, SURFACE_SKIP, type Ladder } from '@s2u/scene';
import { VALVE_LOCKED } from '../../../viewer/src/doors';
import { BODY_RADIUS, Walker } from '../../../viewer/src/mover';
import { SEAL_TUNING_DEFAULTS } from '../../../viewer/src/physics';
import { Traversal } from '../../../viewer/src/traversal';
import { MoverSim } from '../../../viewer/src/net/moverSim';
import { WEAPON_LINE_BOTS_READING } from '../../../viewer/src/weaponLine';
import { Button, TICK_HZ } from '../../../viewer/src/net/protocol';
import { wrapYaw } from '../../../viewer/src/yaw';
import type { SimMap,SimClips } from '../../../viewer/src/simMap';
import {BotClimbDiscovery} from './climbDiscovery';
import type {BotClimbLink} from './climbDrive';
import { navigationShape, type NavigationData, type Point } from './navigationShape';
import { routeCrossesDoor } from './navScheduler';

export type { NavigationData, Point } from './navigationShape';
/**
 * BOP-S: a navigation query as resumable steps -- each `yield` follows a walk test or an A* expansion, or comes just
 * before a mover glide, yielding that glide's work (its samples, `glideSamples`), so a job's budget can stop short of
 * it.
 */
export type NavSteps<T> = Generator<number | void, T, void>;
/** Runs resumable steps to their end at once: the synchronous form of every query (one code path). */
export function drain<T>(steps: NavSteps<T>): T {
  for (;;) { const r = steps.next(); if (r.done) return r.value; }
}
interface Node { at: Point; edges?: number[]; component?: number }
/** BOT-DOOR-PRESS: a leg against a door's leaf -- walkable as the hull stands, barred by that leaf alone, or barred otherwise. */
export type LegBar = 'clear' | 'leaf' | 'blocked';
/** What the planner reads of a door's state (`DoorSet.state`). */
export interface NavDoorState { open: boolean; busy: boolean; valve: number }
/** Authored route intent; only the native player mover can perform the ladder transition. */
export interface BotLadderLink { ladder: Ladder; entry: Point; exit: Point; up: boolean }
/** Authored pad-arrival tolerance, shared by entry validation and the input controller. */
export const BOT_LADDER_ENTRY_TOLERANCE_ADAPTATION = 0.25;
/** Bot approach choices, not retail movement values. Native floor/body probes validate each attachment. */
const LADDER_ROUTE_ADAPTATION = { standOff: [10, 6, BODY_RADIUS + 1, 16, 24], mountProbeTicks: 3 * TICK_HZ };
/** OT.R81 (BTL.R3): the port's invention, no original value -- a bot decision, not an unknown of the game's. New planner bounds, not retail AI constants. The AI source only establishes cell locations (research 75). */
const NAV_ADAPTATION = { bucket: 10, fallbackSpacing: 10, link: 15, sample: 2.5, search: 6000, attach: 60, spawnComponent: 128 };
/**
 * OT.R81 (BOT-DOOR's fold): the port's invention, no original value -- the doorway nodes' offsets along the shut leaf's
 * normal (units; 0 is in the leaf's plane, the others clear of it either side, within the 15-unit link of the AI cells'
 * nodes a cell off), and how far under the leaf's foot the floor may be found (units).
 */
export const BOT_DOORWAY_NODES_ADAPTATION = { offsets: [-8, -4, 0, 4, 8], floor: 4 } as const;
/**
 * LATER 684 (OT.R81, a bot adaptation: the port's invention, no original value -- a bot decision, not an unknown of the
 * game's). The traffic's wall test of a planned leg (`legClearOfWalls`, `MatchBots.space`'s `forward`) glides the probe
 * on the walker's centre line alone (`Walker.glideAi`: one segment at `step_height`, the radius x 1.4 ahead), not its
 * whole segment body. Under the segment body (viewer `WALL_BODY_READING` 'segments') the side lines reach 4.2 across
 * the travel, and a leg passing a corner within that reach was refused on the walls before any teammate was asked, so
 * BOT-CORNER's refusal clock (`TRAFFIC_ADAPTATION.deadlockTicks`) never ran there and both bots stood until the stall
 * recovery (botRampDeadlock, staged on the warm-up yaws). Walked, such a leg is the walker's and the bot's corner
 * steering's (`SIDE_SLIDE_ADAPTATION`, `CORNER_SLIDE_ADAPTATION`), as when no teammate is near and the leg is taken
 * unprobed. `false` gives the whole body's glide (the test before LATER 684). The players' walker is untouched.
 */
export const LEG_WALLS_CENTRE_ADAPTATION = true as boolean;
/** OT.R81: the port's invention, no original value -- a memory bound for BOP-S's attachment answers (entries). */
const ATTACH_CACHE_ADAPTATION = 4096;
const distance = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
/**
 * BOP-S (a): a glide's work -- its ground length in the walk test's samples, at least 1. A count, never a clock: a
 * flat-floor test is one glide of up to 60 units (an attach) or 80 (a direct walk), and its cost grows with its length.
 */
export const glideSamples = (from: Point, to: Point): number =>
  Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[2] - from[2]) / NAV_ADAPTATION.sample));

/** Collision-validated, layered walking graph (authored extension FBA.R5). AI adjacency alone does not prove a usable path. */
export class WalkingNavigation {
  readonly nodes: Node[] = [];
  private readonly buckets = new Map<string, number[]>();
  private readonly unique = new Set<string>();
  private readonly probe: Walker;
  private readonly edgeTests = new Map<string, boolean>();
  /**
   * BOT-DOOR's fold (OT.R81, the bots' planning only): the door edges' walk tests -- the same test on a view of the hull
   * without the door leaves (`doorlessView`); emptied with the hull's other answers at a door change (a hull may hold a
   * moving part no door marks) and when the world's revision moves (`doorEdgeRevision`).
   */
  private readonly doorEdgeTests = new Map<string, boolean>();
  private doorEdgeRevision = -1;
  private doorless?: { grid: SimMap['grid']; probe: Walker };
  /** BOT-DOOR-PRESS: per door, the hull without that door's leaf alone (`leafView`). */
  private readonly leafViews = new Map<number, { grid: SimMap['grid']; probe: Walker }>();
  /**
   * BOT-DOOR-PRESS (OT.R81, a pure speed-up): the press's answers (`legBar`, `shutIn`) by exact coordinates and door,
   * read only off the hull, so emptied with the attachment answers (`clearAttached`: a door change, a moving hull, the
   * world's revision) and bounded as they are.
   */
  private readonly pressTests = new Map<string, LegBar | boolean>();
  /** The doors' state the door edges read (`setDoorState`); none set: every door shut and unlocked, as a round starts (PF.R10). */
  private doorState: (door: number) => NavDoorState = () => ({ open: false, busy: false, valve: 0 });
  /** BOP-S (OT.R81, a pure speed-up): the nodes `doorsChanged` re-tests, fixed for the map (every door's sweep). */
  private doorNodes?: Uint8Array;
  /** BOP-S: weak labels that hold in every door state -- built once, at the first door change (`doorSafeLabels`). */
  private doorLabels?: Int32Array;
  /** BOP-S: bumped by every door change; a navigation job started under another revision is stale. */
  revision = 0;
  /** BOP-S's work unit, counted, never a clock: a glide's samples (`glideSamples`), one per 16 A* expansions. */
  work = 0;
  /**
   * BOP-S (OT.R81, a pure speed-up): `nearest`'s answers by the exact coordinates asked, a failure (`null`) too. An
   * answer reads only the hull, so it is forgotten whenever the hull may have moved: at a door change, when the world
   * bumps `grid.revision` (an owner's active bit: C4 barriers, the round's reset -- checked here, at each lookup), and
   * on every tick a door swings or a lever gate or a crane moves or has moved (`hullMoving`, which MatchBots calls from
   * its doors' state and `movingHullStamp`). Bounded: emptied when it reaches `ATTACH_CACHE_ADAPTATION`.
   */
  private readonly attached = new Map<string, number | null>();
  /** The world's revision the attachment answers were read at. */
  private attachedRevision = -1;
  /**
   * BOP-S batch 8 (04's review F2 on #572): bumped by every clear of `attached`. A lookup paused across a clear (a
   * job's steps over ticks) would store an answer read on the old hull; it keeps the generation it began in and
   * stores nothing when that has moved on -- it still returns its answer.
   */
  private attachedGeneration = 0;
  private clearAttached(): void { this.attached.clear(); this.attachedGeneration++; this.pressTests.clear(); }
  readonly ladderLinks: BotLadderLink[] = [];
  readonly rejectedLadderLinks: {ladder:Ladder; up:boolean; reason:'no-walking-attachment' | 'native-mount-refused'}[] = [];
  private readonly ladderEdges = new Map<number, Map<number, BotLadderLink>>();
  readonly climbLinks:BotClimbLink[]=[];
  private readonly climbEdges=new Map<number,Map<number,BotClimbLink>>();
  private climbClips:SimClips|null=null;
  private climbDiscovery:BotClimbDiscovery|null=null;
  private climbRevision=-1;

  configureClimbing(clips:SimClips|null):void {this.climbClips=clips;this.climbRevision=-1;this.syncClimbing();}
  // Adapted to main's queue: a climb admitted or the climbs reset bumps `revision` (his `topology`), so a navigation job
  // asked before it is redone against the graph as it now stands (navScheduler's stale test), as his queries went stale.
  private syncClimbing():void {
    if(!this.climbClips||this.climbRevision===this.map.grid.revision)return;
    this.climbRevision=this.map.grid.revision;this.climbEdges.clear();this.climbLinks.length=0;this.revision++;
    this.climbDiscovery=new BotClimbDiscovery(this.map,this.climbClips,(a,b)=>this.canWalk(a,b),(from,link)=>{
      const to=this.nearest(link.exit);if(to===null||from===to||!this.canWalk(link.exit,this.nodes[to]!.at))return;
      const edges=this.climbEdges.get(from)??new Map<number,BotClimbLink>();
      if(edges.has(to))return;edges.set(to,link);this.climbEdges.set(from,edges);this.climbLinks.push(link);this.revision++;
    });
  }
  stepClimbDiscovery(budget:number):void {this.syncClimbing();this.climbDiscovery?.step(budget,this.nodes);}
  climbLink(entry:Point|undefined,exit:Point|undefined):BotClimbLink|null {
    this.syncClimbing();return entry&&exit?this.climbLinks.find(l=>distance(l.entry,entry)<0.001&&distance(l.exit,exit)<0.001)??null:null;
  }
  private transition(from:number,to:number):BotLadderLink|BotClimbLink|undefined {
    return this.ladderEdges.get(from)?.get(to)??this.climbEdges.get(from)?.get(to);
  }

  /** A native door moves the shared hull. Recheck only nearby graph edges; old component labels can no longer
   * prove disconnection. No new floor nodes, collision exemptions or map-specific passage hints are invented. */
  doorsChanged(): void {
    if(this.climbClips){this.climbRevision=-1;this.syncClimbing();}
    const sweeps = (this.map.doors ?? []).map((door) => door.sweep);
    if (!sweeps.length) return;
    this.revision++;
    this.clearAttached();
    this.probe.invalidateWallCache();
    this.doorless?.probe.invalidateWallCache(); this.doorEdgeTests.clear();   // BOT-DOOR's fold: the door edges' answers too
    for (const view of this.leafViews.values()) view.probe.invalidateWallCache();   // BOT-DOOR-PRESS: the press's views
    this.edgeTests.clear();
    const near = this.doorNodes ??= new Uint8Array(this.nodes.length);
    for (let id = 0; id < this.nodes.length; id++) {
      const node = this.nodes[id]!;
      node.component = undefined;
      if (sweeps.some((s) => node.at[0] >= s.minX - NAV_ADAPTATION.link && node.at[0] <= s.maxX + NAV_ADAPTATION.link
        && node.at[2] >= s.minZ - NAV_ADAPTATION.link && node.at[2] <= s.maxZ + NAV_ADAPTATION.link)) { node.edges = undefined; near[id] = 1; }
    }
  }

  /**
   * BOP-S (OT.R81; a pure speed-up, every answer unchanged): weak component labels that stay true whatever the doors
   * do, so a goal in another component is refused without an A* walk after a door change too. A node `doorsChanged`
   * re-tests is joined to every node its edge test could ever accept (the geometric pre-filter of `neighbours`,
   * before the walk test); every other node by its own edges, which no door change touches. Each real edge is in that
   * union in every door state, so different labels prove A* cannot reach the goal. The labels do not depend on the
   * door state, so they are built once (one union-find over the graph, no walk test) and reused at every toggle.
   */
  private doorSafeLabels(): Int32Array {
    if (this.doorLabels) return this.doorLabels;
    const near = this.doorNodes!, parent = Int32Array.from(this.nodes.map((_, i) => i));
    const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]!]!; i = parent[i]!; } return i; };
    const join = (i: number, j: number): void => { const a = find(i), b = find(j); if (a !== b) parent[a] = b; };
    for (let id = 0; id < this.nodes.length; id++) {
      const node = this.nodes[id]!;
      if (!near[id] && node.edges) { for (const j of node.edges) join(id, j); continue; }
      for (const other of this.around(node.at, NAV_ADAPTATION.link)) if (other !== id && this.linkable(node.at, this.nodes[other]!.at)) join(id, other);
    }
    for (let i = 0; i < this.nodes.length; i++) parent[i] = find(i);
    return this.doorLabels = parent;
  }

  /** `neighbours`' geometric pre-filter: the pairs whose walk test may make an edge. */
  private linkable(at: Point, to: Point): boolean {
    const horizontal = Math.hypot(to[0] - at[0], to[2] - at[2]);
    return !(horizontal < 0.1 || horizontal > NAV_ADAPTATION.link || Math.abs(to[1] - at[1]) > horizontal * 1.2 + 6.5);
  }

  /**
   * `options.ladders` (P537-L3 ladders, `../botGates` `botBehaviours`, Fuse's 86d8be1b5): the disc's ladders overlaid on
   * a held graph as links (`connectLadders`). Off -- every public room, Frostfire and Vigilance -- no overlay: main's
   * graph, its held edges shared as main shares them, its components as held. The graph file is never touched either way.
   */
  constructor(readonly map: SimMap, prepared?: NavigationData, generate = false, options: { ladders?: boolean } = {}) {
    this.probe = new Walker(map.grid);
    if (prepared) {
      const data = prepared.nodes;
      if (data.length && data.every((n) => n.at.length === 3 && n.at.every(Number.isFinite)
        && n.edges.every((id) => Number.isInteger(id) && id >= 0 && id < data.length))) {
        for (const n of data) { this.add([...n.at]); Object.assign(this.nodes[this.nodes.length - 1]!, { edges: n.edges, component: n.component }); }
        if (options.ladders) this.connectLadders();
        return;
      }
    }
    if (!generate) return;
    const ai = map.ai;
    const addColumn = (x: number, z: number): void => {
      for (const h of probeGround(map.grid, x, z)) {
        // Sub-map Y bounds are not per-cell floors (research 75). Keep distinct actual floors, including wading beds.
        if (h.normal[1] < SEAL_TUNING_DEFAULTS.max_slope) continue;
        if (segmentHit(map.grid, [x, h.y + 1, z], [x, h.y + 19, z], (p) => !isLiquidSurface(p) && (surfaceWord(p) & SURFACE_SKIP) === 0)) continue;
        this.add([x, h.y, z]);
      }
    };
    if (ai?.maps.length) {
      for (const sub of ai.maps) for (let z = 0; z < sub.rows.length; z++) {
        const row = sub.rows[z]!;
        for (let x = row.x0; x < row.x1; x++) {
          const [wx, wz] = aiCellCentre(sub, x, z);
          addColumn(wx, wz);
        }
      }
    } else {
      const g = map.ground.grid, step = NAV_ADAPTATION.fallbackSpacing;
      for (let z = g.originZ + step / 2; z < g.originZ + g.cellsZ * g.cellDim; z += step)
        for (let x = g.originX + step / 2; x < g.originX + g.cellsX * g.cellDim; x += step) addColumn(x, z);
    }
    this.addDoorways();
  }

  /**
   * BOT-DOOR's fold (OT.R81, the bots' planning only; `BOT_DOORWAY_NODES_ADAPTATION`): floor nodes across each doorway.
   * The AI cells' centres lie a cell apart, and a doorway as narrow as a leaf (MP2's bdoor_4: a body passes on 5 of its
   * 13 units) holds none, so no edge ever crossed it, open or shut. The doorway is read off the leaf at rest (shut): the
   * line from its hinge (`DoorSpec.sweep`'s centre) to its farthest point; nodes stand on its middle, along the leaf's
   * normal at the offsets named, on the floor under the leaf (the door edges' hull, `doorlessView`), each only where a body
   * stands there with the leaf gone. The original's planner reads its static AI map through the doorway (research 364
   * section 10); these nodes are the port's way to the same plan.
   */
  private addDoorways(): void {
    const view = this.doorlessView();
    for (const door of this.map.doors ?? []) {
      const s = door.sweep, hinge = [(s.minX + s.maxX) / 2, (s.minZ + s.maxZ) / 2] as const;
      let far: number[] | null = null, best = -1, low = Infinity;
      for (const o of this.map.grid.objects) {
        if (o.kind !== 'collision' || o.owner.sweep !== s) continue;
        for (const p of o.polys) for (let k = 0; k < p.points.length; k += 3) {
          const d = Math.hypot(p.points[k]! - hinge[0], p.points[k + 2]! - hinge[1]);
          if (d > best) { best = d; far = [p.points[k]!, p.points[k + 2]!]; }
          low = Math.min(low, p.points[k + 1]!);
        }
      }
      if (!far || best < 1 || !Number.isFinite(low)) continue;
      const ux = (far[0]! - hinge[0]) / best, uz = (far[1]! - hinge[1]) / best;
      const mx = (hinge[0] + far[0]!) / 2, mz = (hinge[1] + far[1]!) / 2;
      for (const off of BOT_DOORWAY_NODES_ADAPTATION.offsets) {
        const x = mx - uz * off, z = mz + ux * off;
        const floor = probeFloor(view.grid, x, low + 1, z);
        if (!floor || Math.abs(floor.y - low) > BOT_DOORWAY_NODES_ADAPTATION.floor || floor.normal[1] < SEAL_TUNING_DEFAULTS.max_slope) continue;
        const at: Point = [x, floor.y, z];
        if (!this.clearBody(at, at, view.probe)) continue;
        this.add(at);
      }
    }
  }

  /** Enumerate approaches lazily: ordinary ladders need only their first valid floor on each side. */
  private *ladderAttachments(ladder: Ladder, top: boolean): Generator<{at:Point; node:number}> {
    const y = top ? ladder.top : ladder.bottom, sign = top ? -1 : 1;
    for (const offset of LADDER_ROUTE_ADAPTATION.standOff) for (const across of [0, -ladder.halfWidth, ladder.halfWidth,
      -ladder.halfWidth - BODY_RADIUS/2, ladder.halfWidth + BODY_RADIUS/2]) {
      const x = ladder.x + ladder.nx * offset * sign - ladder.nz * across;
      const z = ladder.z + ladder.nz * offset * sign + ladder.nx * across;
      // A ladder span may extend below sloping ground; its lowest polygon vertex is not necessarily its foot floor.
      const floors = probeGround(this.map.grid, x, z).filter(floor => top ? Math.abs(floor.y - y) <= SEAL_TUNING_DEFAULTS.step_height
        : floor.y >= ladder.bottom - SEAL_TUNING_DEFAULTS.step_height && floor.y < ladder.top - SEAL_TUNING_DEFAULTS.step_height)
        .sort((a,b) => Math.abs(a.y-y) - Math.abs(b.y-y));
      for (const floor of floors) {
        const at: Point = [x, floor.y, z], node = this.nearest(at);
        if (node !== null && this.canWalk(this.nodes[node]!.at, at)) yield {at,node};
      }
    }
  }

  /** Overlay the disc's native ladders on held walking graphs; no graph rebuild or collision exemption. */
  private connectLadders(): void {
    const polys = this.map.grid.objects.flatMap(o => o.kind === 'collision' ? [...o.polys] : []);
    const walker = new Walker(this.map.grid), moves = new Traversal(this.map.grid, polys), sim = new MoverSim(walker, moves);
    walker.weaponLineCast = WEAPON_LINE_BOTS_READING === 'cast';   // SEGMENT-BODY part 4: a bot's body casts no weapon line
    const parents = new Map<number, number>();
    const root = (c: number): number => { let next: number | undefined; while ((next = parents.get(c)) !== undefined) c = next; return c; };
    for (const ladder of moves.ladders) {
      const canMount = (at: Point, up: boolean): boolean => {
        moves.reset(walker); walker.place(...at);
        const yaw = wrapYaw(Math.atan2(ladder.nx,ladder.nz) * 180 / Math.PI);
        walker.state.yaw = yaw;
        for (let tick = 0; tick < LADDER_ROUTE_ADAPTATION.mountProbeTicks; tick++) {
          // LC-2 (a bot adaptation): the press with the ladder's CLIMB offered, as `BotLadderDrive` presses (LC-1: no touch mount).
          const press = moves.climbPrompt()?.kind === 'ladder' ? Button.Action : 0;
          sim.apply({seq:sim.seq + 1, yaw, pitch:0, turn:0, buttons:press, stance:0, weapon:0, forward:up ? 1 : -1, right:0});
          if (moves.state().ladder === ladder.path && moves.state().kind.startsWith('ladder')) return true;
        }
        return false;
      };
      const connect = (up: boolean): void => {
        const to: {at:Point; node:number} | undefined = this.ladderAttachments(ladder,up).next().value;
        let from: {at:Point; node:number} | undefined, hadCandidate = false;
        if (to) for (const p of this.ladderAttachments(ladder,!up)) {
          hadCandidate = true;
          if (p.node !== to.node && [0, -2*BOT_LADDER_ENTRY_TOLERANCE_ADAPTATION, 2*BOT_LADDER_ENTRY_TOLERANCE_ADAPTATION].every(side => {
            const at: Point = [p.at[0] - ladder.nz*side, p.at[1], p.at[2] + ladder.nx*side];
            return this.canWalk(p.at,at) && canMount(at,up);
          })) {from = p; break;}
        }
        if (!from || !to) {
          this.rejectedLadderLinks.push({ladder,up,reason:!hadCandidate || !to ? 'no-walking-attachment' : 'native-mount-refused'});
          return;
        }
        const link: BotLadderLink = { ladder, entry: from.at, exit: to.at, up };
        if (!this.ladderEdges.has(from.node)) this.ladderEdges.set(from.node, new Map());
        this.ladderEdges.get(from.node)!.set(to.node, link);
        this.ladderLinks.push(link);
        const a = this.nodes[from.node]!.component, b = this.nodes[to.node]!.component;
        if (a !== undefined && b !== undefined && root(a) !== root(b)) parents.set(root(a), root(b));
      };
      connect(true); connect(false);
    }
    // The old weak-component rejection must account for these explicit native transitions. Adjacency still decides routes.
    for (const n of this.nodes) if (n.component !== undefined) n.component = root(n.component);
  }

  ladderLink(entry: Point | undefined, exit: Point | undefined): BotLadderLink | null {
    return entry && exit ? this.ladderLinks.find(l => distance(l.entry, entry) < 0.001 && distance(l.exit, exit) < 0.001) ?? null : null;
  }

  private key(x: number, z: number): string { return `${Math.floor(x / NAV_ADAPTATION.bucket)},${Math.floor(z / NAV_ADAPTATION.bucket)}`; }
  private add(at: Point): void {
    const key = at.map((v) => Math.round(v * 2)).join(',');
    if (this.unique.has(key)) return;
    this.unique.add(key);
    const id = this.nodes.length;
    this.nodes.push({ at });
    const bucket = this.key(at[0], at[2]);
    if (!this.buckets.has(bucket)) this.buckets.set(bucket, []);
    this.buckets.get(bucket)!.push(id);
  }

  /** Short movement segments checked against the same floor/step limits and body width the human uses. */
  canWalk(a: Point, b: Point): boolean { return drain(this.canWalkSteps(a, b)); }

  /**
   * `canWalk` as resumable steps (BOP-S, the attach bypass): one step per mover glide. A long test (a 60-unit attach,
   * an 80-unit direct walk: up to 32 glides) is no longer one step a job's budget can only check after. Task (a): the
   * step comes BEFORE its glide and yields the glide's samples, so the budget stops short of a glide it cannot pay.
   */
  *canWalkSteps(a: Point, b: Point, doorless: boolean | number = false, centre = false): NavSteps<boolean> {
    const length = Math.hypot(b[0] - a[0], b[2] - a[2]);
    // `true`: the hull without every door leaf (the door edges'); a door's index: without that door's leaf alone (the press).
    const view = doorless === false ? null : doorless === true ? this.doorlessView() : this.leafView(doorless), grid = view?.grid ?? this.map.grid;
    if (length < 0.01) {
      if (Math.abs(a[1] - b[1]) >= 1) return false;
      yield glideSamples(a, b);
      return this.clearBody(a, b, view?.probe, centre);
    }
    const parts = Math.ceil(length / NAV_ADAPTATION.sample);
    let previous: Point = a;
    const steps: Point[] = [a];
    let straightFloor = true;
    for (let i = 1; i <= parts; i++) {
      const t = i / parts, x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t;
      const floor = probeFloor(grid, x, previous[1], z);
      if (!floor || floor.normal[1] < SEAL_TUNING_DEFAULTS.max_slope
        || floor.y - previous[1] > SEAL_TUNING_DEFAULTS.step_height || previous[1] - floor.y > SEAL_TUNING_DEFAULTS.ground_touch_distance) return false;
      const next: Point = [x, floor.y, z];
      if (Math.abs(floor.y - (a[1] + (b[1] - a[1]) * t)) > 0.001) straightFloor = false;
      steps.push(next);
      previous = next;
    }
    if (Math.abs(previous[1] - b[1]) >= 2) return false;
    // Flat/planar floors trace the identical line once instead of six collinear sub-segments.
    const traced = straightFloor ? [a, b] : steps;
    for (let i = 1; i < traced.length; i++) {
      const before = traced[i - 1]!, next = traced[i]!;
      yield glideSamples(before, next);
      if (!this.clearBody(before, next, view?.probe, centre)) return false;
    }
    return true;
  }

  /**
   * The glide test: the scratch mover placed at `from` and moved to `to` as the human's walker moves -- its whole segment
   * body (`glide`), or with `centre` (`LEG_WALLS_CENTRE_ADAPTATION`) the body's centre line alone (`glideAi`).
   */
  private clearBody(from: Point, to: Point, probe = this.probe, centre = false): boolean {
    this.work += glideSamples(from, to);
    // Reuse the current human mover's actual wall probes and body radius instead of porting an older collision copy.
    // This scratch mover is never a combatant and cannot affect any player's state.
    if (!probe.place(from[0], from[1], from[2])) return false;
    if (Math.abs(probe.state.y - from[1]) > 1) return false;
    probe.clearWallHits();   // LATER 535: no tick empties the probe's contacts; kept, they grew the heap to its cap
    if (centre) probe.glideAi(to[0] - from[0], to[2] - from[2]);
    else probe.glide(to[0] - from[0], to[2] - from[2]);
    const s = probe.state;
    return !probe.airborne && Math.hypot(s.x - to[0], s.z - to[2]) < 0.05 && Math.abs(s.y - to[1]) < 2;
  }

  /**
   * BOT-DOOR's fold (OT.R81; the bots' planning only, never the player's walker or the hull): the hull as the planner's
   * door edges see it -- every cell's atoms but the door leaves' (`CollisionOwner.sweep`), the rest the world's own grid
   * (its revision read through, so a C4 barrier or the round's reset still empties the scratch probe's caches) -- with a
   * scratch probe of its own on it. Built once, at the first door edge's test.
   */
  private doorlessView(): { grid: SimMap['grid']; probe: Walker } {
    if (this.doorless) return this.doorless;
    const world = this.map.grid, sweeps = new Set((this.map.doors ?? []).map((door) => door.sweep));
    // A door's leaf only: a lever gate's or a crane's owner (also a `sweep`) stays, as the hull holds it.
    const leaf = (a: SimMap['grid']['cells'][number]['atoms'][number]): boolean =>
      a.object.kind === 'collision' && !!a.object.owner.sweep && sweeps.has(a.object.owner.sweep);
    const cells = world.cells.map((c) => (c.atoms.some(leaf) ? { ...c, atoms: c.atoms.filter((a) => !leaf(a)) } : c));
    const grid = Object.create(world, { cells: { value: cells } }) as SimMap['grid'];
    return this.doorless = { grid, probe: new Walker(grid) };
  }

  /**
   * BOT-DOOR-PRESS (OT.R81, the bots' press only): the hull without door `door`'s leaf alone -- `doorlessView` for one
   * door, so a leg another door's leaf bars is still refused (MP71's door_ft_2 and door_ft_5 overlap, a floor apart).
   * Built at its door's first press test; its probe's walls emptied at every door change, as the others'.
   */
  private leafView(door: number): { grid: SimMap['grid']; probe: Walker } {
    const known = this.leafViews.get(door);
    if (known) return known;
    const world = this.map.grid, sweep = this.map.doors?.[door]?.sweep;
    const leaf = (a: SimMap['grid']['cells'][number]['atoms'][number]): boolean =>
      !!sweep && a.object.kind === 'collision' && a.object.owner.sweep === sweep;
    const cells = world.cells.map((c) => (c.atoms.some(leaf) ? { ...c, atoms: c.atoms.filter((a) => !leaf(a)) } : c));
    const grid = Object.create(world, { cells: { value: cells } }) as SimMap['grid'];
    const view = { grid, probe: new Walker(grid) };
    this.leafViews.set(door, view);
    return view;
  }

  /** BOT-DOOR's fold: the doors' state the door edges read (`MatchBots`: its room's `DoorSet.state`). */
  setDoorState(read: (door: number) => NavDoorState): void { this.doorState = read; }

  /**
   * BOT-DOOR's fold (OT.R81): whether the edge `a`-`b`, refused by the walk test on the hull as it stands, may be a door
   * edge -- it meets the swing box (`DoorSpec.sweep`) of at least one door, and every door it meets is shut or swinging
   * (not open at rest, whose leaf stands where the walk test met it) and not locked. The original's planner reads a
   * static AI map and plans through a doorway whatever the door's state; its door task walks to the door and uses it
   * (`FUN_005efa50`, D:L502499-502654). The bots are the port's own: this is their door task's plan, and the CPU's press
   * on that walk (`MatchBots.wantsDoor`) its use.
   */
  private doorEdgeAllowed(a: Point, b: Point): boolean {
    const doors = this.map.doors ?? [];
    let met = false;
    for (let i = 0; i < doors.length; i++) {
      if (!routeCrossesDoor(a, [b], [doors[i]!.sweep])) continue;
      const s = this.doorState(i);
      if (s.valve === VALVE_LOCKED || (s.open && !s.busy)) return false;
      met = true;
    }
    return met;
  }

  /** Whether `at` lies in the swing box (`DoorSpec.sweep`) of an unlocked door. */
  private inDoorSweep(at: Point): boolean {
    const doors = this.map.doors ?? [];
    for (let i = 0; i < doors.length; i++) {
      const s = doors[i]!.sweep;
      if (at[0] >= s.minX && at[0] <= s.maxX && at[2] >= s.minZ && at[2] <= s.maxZ && this.doorState(i).valve !== VALVE_LOCKED) return true;
    }
    return false;
  }

  /**
   * BOT-DOOR doorway attach (OT.R81): `doorEdgeAllowed` for an attachment from inside a swing box -- the leg `at`-`b`
   * meets at least one door's swing and no door it meets is locked, the door's state otherwise not read. A door edge
   * refuses a door open at rest (its leaf stands where the edge's test met it); a bot already inside the swing, behind
   * that open leaf, has no other way out, and its press shuts the leaf off its leg (`MatchBots.wantsDoor`, BOT-DOOR-PRESS:
   * its first leg barred by that leaf alone, the bot shut in).
   */
  private doorAttachAllowed(a: Point, b: Point): boolean {
    const doors = this.map.doors ?? [];
    let met = false;
    for (let i = 0; i < doors.length; i++) {
      if (!routeCrossesDoor(a, [b], [doors[i]!.sweep])) continue;
      if (this.doorState(i).valve === VALVE_LOCKED) return false;
      met = true;
    }
    return met;
  }

  /**
   * BOT-DOOR-PRESS (OT.R81, the bots' press only): the leg `a`-`b` against door `door`'s leaf where it stands --
   * 'clear' when the walk test passes on the hull as it stands, 'leaf' when it is refused there and passes on the hull
   * without that door's leaf alone (`leafView`), 'blocked' otherwise (a wall, or another door's leaf). Its glides are
   * charged to the navigation budget (`work`), as every walk test's; an answer is kept until the hull may have moved.
   */
  legBar(a: Point, b: Point, door: number): LegBar {
    this.checkRevision();
    const key = `${door}:${a[0]},${a[1]},${a[2]}:${b[0]},${b[1]},${b[2]}`, known = this.pressTests.get(key);
    if (typeof known === 'string') return known;
    const bar: LegBar = drain(this.canWalkSteps(a, b)) ? 'clear' : drain(this.canWalkSteps(a, b, door)) ? 'leaf' : 'blocked';
    this.keepPressTest(key, bar);
    return bar;
  }

  /**
   * BOT-DOOR-PRESS (OT.R81): whether a body at `at` is shut in -- no attachment candidate's walk test passes on the hull
   * as it stands (`nearestSteps`' ordinary pass): MP51's niche behind door_ft_2's open leaf. Charged and kept as `legBar`.
   */
  shutIn(at: Point): boolean {
    this.checkRevision();
    const key = `shut:${at[0]},${at[1]},${at[2]}`, known = this.pressTests.get(key);
    if (typeof known === 'boolean') return known;
    let shut = true;
    for (const id of this.nearestCandidates(at)) if (drain(this.canWalkSteps(at, this.nodes[id]!.at))) { shut = false; break; }
    this.keepPressTest(key, shut);
    return shut;
  }

  private checkRevision(): void {
    if (this.map.grid.revision !== this.attachedRevision) { this.clearAttached(); this.attachedRevision = this.map.grid.revision; }
  }

  private keepPressTest(key: string, answer: LegBar | boolean): void {
    if (this.pressTests.size >= ATTACH_CACHE_ADAPTATION) this.pressTests.clear();
    this.pressTests.set(key, answer);
  }

  /** A short steering offset follows its actual floor height, including stairs and ramps. */
  offset(from: Point, dx: number, dz: number, length: number): Point | null { return drain(this.offsetSteps(from, dx, dz, length)); }

  /**
   * LATER 684 (`LEG_WALLS_CENTRE_ADAPTATION`): `offset` with the leg's walls asked of the body's centre line -- the
   * traffic's test of a planned leg (`MatchBots.space`'s `forward`), so a leg passing a corner within the side lines'
   * reach still clears the walls and BOT-CORNER asks the teammates along it.
   */
  legClearOfWalls(from: Point, dx: number, dz: number, length: number): Point | null {
    return drain(this.offsetSteps(from, dx, dz, length, LEG_WALLS_CENTRE_ADAPTATION));
  }

  /** `offset` as resumable steps (BOP-S, the attach bypass): its walk test's glides, one step each. */
  *offsetSteps(from: Point, dx: number, dz: number, length: number, centre = false): NavSteps<Point | null> {
    const d = Math.hypot(dx, dz); if (d < 0.001) return null;
    const x = from[0] + dx / d * length, z = from[2] + dz / d * length;
    const floor = probeFloor(this.map.grid, x, from[1], z); if (!floor) return null;
    const to: Point = [x, floor.y, z];
    return (yield* this.canWalkSteps(from, to, false, centre)) ? to : null;
  }

  private around(at: Point, radius: number): number[] {
    const out: number[] = [], size = NAV_ADAPTATION.bucket;
    for (let z = Math.floor((at[2] - radius) / size); z <= Math.floor((at[2] + radius) / size); z++)
      for (let x = Math.floor((at[0] - radius) / size); x <= Math.floor((at[0] + radius) / size); x++)
        out.push(...(this.buckets.get(`${x},${z}`) ?? []));
    return out;
  }

  /** `nearest`'s candidates in its order (nearest first, inside the attach radius); the walk test is the caller's. */
  nearestCandidates(at: Point): number[] {
    return this.around(at, NAV_ADAPTATION.attach).sort((a, b) => distance(this.nodes[a]!.at, at) - distance(this.nodes[b]!.at, at))
      .filter((id) => distance(this.nodes[id]!.at, at) < NAV_ADAPTATION.attach);
  }

  nearest(at: Point): number | null { return drain(this.nearestSteps(at)); }

  /** `nearest` as resumable steps (BOP-S): one step per walk test and per mover glide in it. */
  *nearestSteps(at: Point): NavSteps<number | null> {
    if (this.map.grid.revision !== this.attachedRevision) { this.clearAttached(); this.attachedRevision = this.map.grid.revision; }
    const key = `${at[0]},${at[1]},${at[2]}`, known = this.attached.get(key), generation = this.attachedGeneration;
    if (known !== undefined) return known;
    let found: number | null = null;
    for (const id of this.nearestCandidates(at)) {
      const walkable = yield* this.canWalkSteps(at, this.nodes[id]!.at);
      yield;
      if (walkable) { found = id; break; }
    }
    // BOT-DOOR doorway attach (OT.R81, the bots' planning only): a point inside a door's swing whose every candidate
    // meets a leaf (MP51's door_ft_2, open at rest, seals the niche its swing box holds: BCMP s43's bot 234) retries
    // them on the hull without the leaves (`doorAttachAllowed`), as a door edge does; the CPU opens or shuts the door
    // whose leaf bars its leg (`MatchBots.wantsDoor`). Nowhere else does an attachment change.
    if (found === null && this.inDoorSweep(at)) {
      for (const id of this.nearestCandidates(at)) {
        const node = this.nodes[id]!.at;
        if (!this.doorAttachAllowed(at, node)) continue;
        const through = yield* this.canWalkSteps(at, node, true);
        yield;
        if (through) { found = id; break; }
      }
    }
    if (generation !== this.attachedGeneration) return found;   // cleared while it ran: its answer is not stored
    if (this.attached.size >= ATTACH_CACHE_ADAPTATION) this.clearAttached();
    this.attached.set(key, found);
    return found;
  }

  /** A door leaf is mid-swing: the hull moves this tick without a door change, so no attachment may be reused. */
  hullMoving(): void { this.clearAttached(); }

  /**
   * A bounded, spatially distributed set of actual floor nodes for local tactical decisions. `from` (BOT-DOOR-PRESS): the
   * node the asker attaches to; given, only nodes it `mayReach` are drawn.
   */
  nearby(at: Point, radius: number, limit: number, from: number | null = null): Point[] {
    const pool = this.around(at, radius).filter((i) => {
      const p = this.nodes[i]!.at;
      return Math.abs(p[1] - at[1]) < 12 && distance(p, at) <= radius && (from === null || this.mayReach(from, i));
    }).sort((a, b) => distance(this.nodes[a]!.at, at) - distance(this.nodes[b]!.at, at));
    if (pool.length <= limit) return pool.map((id) => [...this.nodes[id]!.at]);
    const out: Point[] = [];
    for (let i = 0; i < limit; i++) out.push([...this.nodes[pool[Math.floor(i * pool.length / limit)]!]!.at]);
    return out;
  }

  private neighbours(id: number): number[] {
    this.climbDiscovery?.enqueue(id,this.nodes[id]!.at);
    const walking = this.walkingNeighbours(id), ladders = this.ladderEdges.get(id),climbs=this.climbEdges.get(id);
    return ladders||climbs ? [...new Set([...walking,...(ladders?.keys()??[]),...(climbs?.keys()??[])])] : walking;
  }

  private walkingNeighbours(id: number): number[] {
    const node = this.nodes[id]!;
    return node.edges ?? drain(this.edgeSteps(id));
  }

  /**
   * A node's edge build (after a door change emptied it) as resumable steps (BOP-S, the attach bypass): each walk
   * test's glides one step each. The edges are set only when the build ends, so a job dropped mid-build leaves the
   * node unbuilt, never half-built; the walk tests already made stay in `edgeTests` for this door state.
   */
  private *edgeSteps(id: number): NavSteps<number[]> {
    const node = this.nodes[id]!, edges: number[] = [];
    if (this.map.grid.revision !== this.doorEdgeRevision) { this.doorEdgeTests.clear(); this.doorEdgeRevision = this.map.grid.revision; }
    for (const other of this.around(node.at, NAV_ADAPTATION.link)) {
      if (id === other) continue;
      const to = this.nodes[other]!.at;
      if (!this.linkable(node.at, to)) continue;
      const key = `${id}:${other}`;
      let valid = this.edgeTests.get(key);
      if (valid === undefined) { valid = yield* this.canWalkSteps(node.at, to); this.edgeTests.set(key, valid); }
      // BOT-DOOR's fold: a shut leaf alone does not refuse an edge (`doorEdgeAllowed`); the CPU opens the door on its walk.
      if (!valid && this.doorEdgeAllowed(node.at, to)) {
        let through = this.doorEdgeTests.get(key);
        if (through === undefined) { through = yield* this.canWalkSteps(node.at, to, true); this.doorEdgeTests.set(key, through); }
        valid = through;
      }
      if (valid) edges.push(other);
    }
    return node.edges = edges;
  }

  /** A* with a fixed expansion budget; an unreachable floor/room yields no route, never a wall-crossing shortcut. */
  route(from: Point, to: Point): Point[] { return drain(this.routeSteps(from, to)); }

  /**
   * `route` as resumable steps (BOP-S): one step per walk test and per mover glide inside it -- the direct walk and
   * both attachments before the search included -- and one per A* expansion and edge build glide. The search's state
   * lives in the generator, so a navigation job (`navScheduler.ts`) resumes it on a later tick; `route` runs it to the
   * end at once (one code path).
   */
  *routeSteps(from: Point, to: Point): NavSteps<Point[]> {
    this.syncClimbing();
    if (distance(from, to) < 80) {
      const direct = yield* this.canWalkSteps(from, to);
      yield;
      if (direct) return [[...to]];
    }
    const start = yield* this.nearestSteps(from), goal = yield* this.nearestSteps(to);
    if (start === null || goal === null) return [];
    if (!this.mayReach(start, goal)) return [];
    const cost = new Map<number, number>([[start, 0]]), previous = new Map<number, number>();
    const open: { id: number; f: number }[] = [];
    const push = (id: number, f: number): void => {
      let at = open.length; open.push({ id, f });
      while (at > 0) { const p = (at - 1) >>> 1; if (open[p]!.f <= f) break; open[at] = open[p]!; at = p; }
      open[at] = { id, f };
    };
    const pop = (): number => {
      const id = open[0]!.id, tail = open.pop()!;
      if (open.length) {
        let at = 0;
        while (at * 2 + 1 < open.length) {
          let child = at * 2 + 1;
          if (child + 1 < open.length && open[child + 1]!.f < open[child]!.f) child++;
          if (open[child]!.f >= tail.f) break;
          open[at] = open[child]!; at = child;
        }
        open[at] = tail;
      }
      return id;
    };
    push(start, 0);
    const closed = new Set<number>();
    while (open.length && closed.size < NAV_ADAPTATION.search) {
      const id = pop();
      this.work += 1 / 16;
      yield;
      if (closed.has(id)) continue;
      if (id === goal) {
        const ids: number[] = [id];
        let back = id;
        while (previous.has(back)) { back = previous.get(back)!; ids.push(back); }
        ids.reverse();
        const path: Point[] = [];
        for (let i = 0; i < ids.length; i++) {
          const at = ids[i]!;
          path.push([...this.nodes[at]!.at]);
          const ladder = this.transition(at,ids[i + 1]!);
          if (ladder) path.push([...ladder.entry], [...ladder.exit]);
        }
        if (yield* this.canWalkSteps(path[path.length - 1]!, to)) path.push([...to]);
        return path;
      }
      closed.add(id);
      if (!this.nodes[id]!.edges) yield* this.edgeSteps(id);   // a door change emptied it: its build, sliced
      for (const next of this.neighbours(id)) {
        const g = cost.get(id)! + distance(this.nodes[id]!.at, this.nodes[next]!.at);
        if (g >= (cost.get(next) ?? Infinity)) continue;
        cost.set(next, g); previous.set(next, id);
        push(next, g + distance(this.nodes[next]!.at, this.nodes[goal]!.at));
      }
    }
    return [];
  }

  /**
   * Whether the A* of `routeSteps` may reach node `goal` from node `start`: false only where the labels prove it cannot
   * -- the graph's weak components while they stand, else (after a door change erased them, `doorsChanged`) the
   * door-safe labels (`doorSafeLabels`). `routeSteps` refuses such a pair before its search; BOT-DOOR-PRESS (OT.R81, the
   * bots' planning) keeps the patrol's and the search fallback's draws to the pairs it does not refuse.
   */
  mayReach(start: number, goal: number): boolean {
    const component = this.nodes[start]!.component;
    if (component !== undefined && component !== this.nodes[goal]!.component && !this.climbDiscovery?.enabled) return false;
    // P537-L3 ladders, climbs: the door-safe labels know the walking edges only -- they prove nothing across a ladder or
    // climb link, nor before a climb is found.
    if (this.doorNodes && !this.ladderLinks.length && !this.climbLinks.length && !this.climbDiscovery?.enabled) { const labels = this.doorSafeLabels(); if (labels[start] !== labels[goal]) return false; }
    return true;
  }

  patrol(from: Point, random: () => number): Point[] { return drain(this.patrolSteps(from, random)); }

  /** `patrol` as resumable steps (BOP-S); its random draws happen in the same order, when its steps run. */
  *patrolSteps(from: Point, random: () => number): NavSteps<Point[]> {
    if (!this.nodes.length) return yield* this.localPatrolSteps(from, random);
    // A local random destination keeps planning bounded and explores farther as the patrol advances.
    const near = this.around(from, random() < 0.25 ? 900 : 250);
    const start = yield* this.nearestSteps(from), component = start === null ? undefined : this.nodes[start]!.component;
    const candidates = near.length ? near : this.nodes.map((_, i) => i);
    // BOT-DOOR-PRESS: once a door change erased the components, the door-safe labels keep the draw to nodes `routeSteps`
    // does not refuse outright (before it a CPU spent its three tries on targets the labels rule out).
    const pool = component !== undefined ? candidates.filter((id) => this.nodes[id]!.component === component)
      : start !== null && this.doorNodes ? candidates.filter((id) => this.mayReach(start, id)) : candidates;
    if (!pool.length) return yield* this.localPatrolSteps(from, random);
    for (let i = 0; i < 3; i++) {
      const at = this.nodes[pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]!]!.at;
      if (distance(from, at) < 30) continue;
      const route = yield* this.routeSteps(from, at);
      if (route.length) return route;
    }
    return yield* this.localPatrolSteps(from, random);
  }

  private *localPatrolSteps(from: Point, random: () => number): NavSteps<Point[]> {
    // A sparse/isolated authored cell must not strand a bot that has ordinary walkable ground beside it.
    const offset = random() * Math.PI * 2;
    for (let i = 0; i < 12; i++) {
      const angle = offset + i * Math.PI / 6;
      let at: Point = from;
      for (let step = 1; step <= 16; step++) {
        const x = from[0] + Math.sin(angle) * step * 2.5, z = from[2] + Math.cos(angle) * step * 2.5;
        const floor = probeFloor(this.map.grid, x, at[1], z);
        if (!floor) break;
        const next: Point = [x, floor.y, z];
        const walkable = yield* this.canWalkSteps(at, next);
        yield;
        if (!walkable) break;
        at = next;
      }
      if (distance(from, at) > 20) return [at];
    }
    return [];
  }

  /** Expensive collision checks belong in local asset preparation, before the player launches a room. */
  prepare(progress?: (done: number, total: number) => void): NavigationData {
    for (let id = 0; id < this.nodes.length; id++) {
      this.neighbours(id);
      if (id % 1000 === 0) progress?.(id, this.nodes.length);
    }
    // Weak components reject impossible searches immediately; directed edges still decide any actual route.
    const parent = Int32Array.from(this.nodes.map((_, i) => i));
    const find = (i: number): number => { while (parent[i] !== i) { parent[i] = parent[parent[i]!]!; i = parent[i]!; } return i; };
    for (let i = 0; i < this.nodes.length; i++) for (const j of this.nodes[i]!.edges!) {
      const a = find(i), b = find(j); if (a !== b) parent[a] = b;
    }
    for (let i = 0; i < this.nodes.length; i++) this.nodes[i]!.component = find(i);
    const sizes = new Map<number, number>();
    for (const n of this.nodes) sizes.set(n.component!, (sizes.get(n.component!) ?? 0) + 1);
    const spawnable = (slots: SimMap['slots']): string[] => slots.filter((s) => {
      const id = s.onFloor ? this.nearest([...s.position]) : null;
      return id !== null && this.nodes[id]!.edges!.length > 0 && (sizes.get(this.nodes[id]!.component!) ?? 0) >= NAV_ADAPTATION.spawnComponent;
    }).map((s) => `${s.side}:${s.index}`);
    return { version: 2, map: this.map.stem, nodes: this.nodes.map((n) => ({ at: [...n.at], edges: n.edges!, component: n.component })),
      spawnable: { start: spawnable(this.map.slots), respawn: spawnable(this.map.respawns) } };
  }
}

/** Explicit local map preparation; never called by a match tick or MatchBots constructor. */
export function prepareBotNavigation(map: SimMap): NavigationData {
  return new WalkingNavigation(map, undefined, true).prepare();
}

/**
 * The ignored asset is untrusted input: require finite points and complete bounded adjacency before using it -- the
 * shape the host's held check reads too (`navigationShape.ts`).
 */
export function validateBotNavigation(map: SimMap, value: unknown): NavigationData | null {
  return navigationShape(value, map.stem);
}
