import { MOTION, NODE_CALLER, NODE_ROOT, type CollisionOwner, type EffectCondition, type EffectOp, type EffectProgram, type Grid, type ParticleSource } from '@s2u/scene';
import { groundPolygons, type GroundData } from './mover';
import { AUTOSTART_INITIAL_READING, under, type MapMeta } from './mapMeta';
import type { EnvWire } from './net/protocol';
import { EffectRun, opacityTick, type EffectHost } from './effectRunner';
import { valveApply, valveTest } from './doors';
import { apply4 } from './doorMath';
import { placeRefs, SceneHealth, SKIP_EFFECTS_VALVE, type SceneMeta, type SceneProgram, type SceneRunContext } from './sceneHealth';
import { NodeFrame, profileStrokeTick, runsProfileStroke, runsScroll, scrollTick, type Vec3 } from './sceneScroll';

/**
 * The world's mutable state (MAP-02; socomlegacy/docs/research/209-the-mutable-world.md s8-s10): one per room and one per
 * page, never shared -- which placed nodes are active, the action valves, the actions used this round -- applied to the
 * collision (each owner's `m_active`, `CollisionOwner.flags` bit 0, the bit `modelGate` reads) and, through the hooks,
 * to the drawing (`WorldView.setNodeActive`). Headless: the page and the match server run this same code (`./sim`).
 *
 * **What the game does** (research 171 s4, 173 s4, 174 s3; research 209 s4):
 *
 * - At initialisation every zAnim node reference with bit 31 makes its node inactive, and then a reference with bit 28
 *   saves the node's active state (`FUN_0026b5e0` D:L115740-115750): `applyInitial`, from `MapMeta.initial`.
 *   Crossroads' `healthy` and `destroyed` both carry an active scene flag before this (171 s4): the raw node flag alone
 *   is wrong, which is why the state starts from the references and not from the flags.
 * - A node's activity reaches its subtree: the engine's walks skip an inactive node and what hangs under it (the
 *   grid's ordered traversal, `grid_main.cpp:303`; the probe's model gate and its recursion into `+0x70`, research 23
 *   s1.1). Crossroads' rubble is 8 polygons at `/destroyed` and 162 at `/destroyed/dia` (171 s3): turning `destroyed`
 *   on must reach `dia`. Here each node keeps its own flag, and a node is active when it and every ancestor are
 *   (`isActive`): turning a parent on leaves a child that was turned off on its own off, as the engine's flags do.
 * - At the round's reset `FUN_002ac0e0` (D:L151976-151991) restores what the references saved (`FUN_0026b430`
 *   D:L115690-115721, `FUN_0026c4f0`) and calls `FUN_002b5510` (D:L157445-157456): the action valves to 0, the running
 *   animations stopped, the use bookkeeping cleared -- `reset`.
 *
 * **Port rules** (no original; research 209 s9): the revision (`Grid.revision`, one more at every change) is what
 * the readers that cache the grid compare against; an instance's id is its `flattenScene` index (ruling PF.R15,
 * `MapMeta.instances`); a node's own flag is kept by its path, so the few paths that repeat (research 209 s5) switch
 * together.
 */

/** One placed node's state, for MAP-03's wire: its own flag now and after `applyInitial`. */
export interface InstanceState { id: number; path: string; active: boolean; initial: boolean /* after applyInitial */ }

/**
 * What the page lends the world: a subtree drawn or hidden, and every change's revision; and (MAP-06) a scene program's
 * effects -- a sound, a particle source, a debris source -- at a placed node (null: none placed). The room lends none.
 */
export interface WorldHooks {
  /** Every placement at or under `path` (`under`) is to be drawn (`on`) or hidden. */
  visible?(path: string, on: boolean): void;
  /** The world changed: its revision now. */
  changed?(revision: number): void;
  /**
   * A program's `SOUND` (a new play only: `newPlay`) at the command's volume: `path` the node it names (the run's root
   * when it names none), `at` where it plays (`SCENE_SOUND_PLACE_READING`; null: without a place).
   */
  sound?(name: string, path: string | null, volume: number, at: [number, number, number] | null): void;
  /** A program's `PARTICLE_SOURCE`, at its root. */
  particles?(source: ParticleSource, path: string | null): void;
  /**
   * A program's `DESTRUCTION_SOURCE`, at its node: the node alone (`GLASS_FRAGMENTS_PLACEHOLDER` -- the command's payload
   * is decoded, `op.debris`, research 210 s6.1, but no fragment is thrown from it yet).
   */
  destruction?(path: string | null): void;
  /**
   * XR-04: a program's `CALL_ANIMATION` of an animation the map's set lacks -- the common set's (`CZANIM`) effects,
   * Crossroads' `fire_explode_med` and `dust_explode_long` -- at the calling program's root (`COMMON_EFFECT_CALL_READING`);
   * a presentation run's only (ruling PF.R26).
   */
  call?(name: string, path: string | null): void;
  /**
   * PB-9b (research 284 s3): a program's `OBJECT_OPACITY_FROM_TO` on a placed node -- its opacity now (`WorldView.setNodeOpacity`);
   * the bases' pulse outlines. Drawing only: the room lends none.
   */
  opacity?(path: string, opacity: number): void;
  /**
   * LATER 782 (`SCROLL_MOTION_PLACEHOLDER`): a program's `SCROLL_MOTION` on a placed node -- the texture offset now of
   * every visual at or under `path`, in texture repeats (`WorldView.setNodeUvOffset`): Fish Hook's washes and water.
   * Drawing only: the room lends none.
   */
  scroll?(path: string, u: number, v: number): void;
  /**
   * Research 386 §3.2 (LATER 63): a program's `FIRE_WEAPON` (`FUN_0025ccb0` D:L107153-107326) -- the round started at the
   * command's node (`path`; null for none, D:L107229-107244), its fuse and second timer the command's floats
   * (D:L107312-107316) -- on the room's run only (a page's run of a death the room decided is presentation, PF.R26): the
   * room fires it (`Room.sceneRound`). Was `BRIDGE_FIRE_WEAPON_READING` (PF.R32): the command fell through.
   */
  fire?(op: Extract<EffectOp, { op: 'fireWeapon' }>, path: string | null): void;
  /**
   * V13-3c (`SCENE_DEATH_ON_WIRE_READING` 'targetOffOrTold'): a destructible's death this world decided and ran -- its
   * health at 0 (`SceneHealth`'s hit or blast, `FUN_00273a50` D:L120980-120989) -- by its record's id; never a death
   * taken from the wire (`takeDeath`). The room tells every page (`Room`'s `sceneDeath`).
   */
  died?(id: number): void;
}

/**
 * GLASS_FRAGMENTS_PLACEHOLDER (SUP-02; research 210 s6, 176 s4.2): what a `DESTRUCTION_SOURCE` throws -- Frostfire's
 * `breakapane` emits one at its root `pane1` -- is decoded (`@s2u/scene` `effects.ts`: `{ op: 'destruction', node,
 * debris }`, research 210 s6.1; LATER 850) but not thrown, and no capture shows a pane break: a broken pane plays its
 * `.GLS_BRK_VSMALL` and goes off, and nothing more is drawn. The page's `destruction` hook logs the node once.
 */
export const GLASS_FRAGMENTS_PLACEHOLDER = 'sound-and-pane-off' as const;

/**
 * SCENE_DEATH_ON_WIRE_READING (SUP-02; research 210 s6; V13-3c, research 386 §3.5): the room decides a destructible's
 * death and tells every page two ways. (1) Its id, at once (`sceneDeath`, protocol 13 additive; a joiner's welcome names
 * the round's dead, `sceneDead`): the page's world takes it (`takeDeath`) -- spent, and unless silent its death's
 * sequences run for presentation (PF.R26). The original's own path for a flagged death has this shape: `FUN_002734b0`
 * (D:L120782-120797) builds a type-8 record naming the animation and sends it through `DAT_00414bfc` (`FUN_002bb880`,
 * message 0x40 to every console online; research 376 §3) -- for the animations whose flag bit 4 is set; for one without
 * it (MP12's `ant_base1`, flags 0x23) every console kills its own copy from the replicated blast. The port's room is the
 * one authority (`SCENE_DEATH_AUTHORITY_READING`), so the told death stands in for both. (2) The geometry (MAP-03's
 * `EnvWire`: the instances off their opening state), not the health -- kept for a state with no told death (a `.s2r`
 * recorded before V13-3c). A page's world takes a live
 * destructible whose target the room's state turns off as dead -- one a distinct target (the first record bound to it,
 * as the room's `SceneHealth.at` picks), none for a record whose target is under another dead one's or whose animation
 * another's death runs as a program -- its record spent
 * (health at most 0: no C4 target) and, unless the state is a joiner's (`silent`, the game's `skip_effects`), its
 * death's sequences run for their effects -- `breakapane`'s `.GLS_BRK_VSMALL` and `DESTRUCTION_SOURCE` -- once, for
 * presentation only (ruling PF.R26, research 210 s7-s8): the run turns no node and sets no valve, at once or later
 * (`access_part_fly`'s caller off at 2 s), so the page's state stays the wire's. A death that does not turn its target off is never
 * heard on the page (MP6's bottles, tin cups, plates and lights): the wire carries no health. A spent destructible whose target the room's state gives back is whole again (the room's round
 * reset, followed without the page's own: the page's offline room, `./net/loopback`) [reading: the original's own
 * network path for a scene object's death (a damage message replayed on each console, or a valve) is not traced;
 * research 209 s11's valve replay is the nearest read].
 */
export const SCENE_DEATH_ON_WIRE_READING = 'targetOffOrTold' as const;

/**
 * SCENE_SOUND_PLACE_READING (research 210 s7; the v0.4.18 gulls, 2026-11-10): where a scene program's `SOUND` plays --
 * `FUN_002659c0`'s new play (D:L112411-112462): the place starts at 0; flag 4 adds the command's offset (+0x14,
 * `FUN_00309240`, D:L112423-112426); flag 8 the context's point (D:L112427-112445: a scene run's context holds none);
 * flag 2 resolves the node (+0x10, `FUN_0026f4e0`) and, when it resolves, carries the place through the node's matrices
 * up to the world (`FUN_00310980`, D:L112446-112450, D:L212139-212147): the node's world origin plus the offset in its
 * frame (`MapMeta.worlds`; a node under a moved one -- a door's leaf, `nodeMoved` -- where it stands now). Any of the
 * three places the sound, played through the bank's +0x14 play with that point (D:L112458-112462: `FUN_00342670`'s
 * RANGE and pan, D:L241907-241950); none plays it unplaced (+0x18, D:L112463-112475). Was `'polygonBoxCentre'`: the
 * centre of the node's polygons' box, unplaced for a node with none -- MP71's four gulls at full volume over the whole
 * map. [reading: transcribed, pending review; the moves of gates, cranes and turrets are not carried (only the doors'),
 * `SCENE_SOUND_MOVING_NODE_PLACEHOLDER`; a node held at the camera plays unplaced, `SCENE_SOUND_CAMERA_NODE_PLACEHOLDER`]
 */
export const SCENE_SOUND_PLACE_READING = 'nodeOrigin' as const;

/**
 * SCENE_SOUND_CAMERA_NODE_PLACEHOLDER: a placed `SOUND` (flag 2) at the camera, or at a node the camera carries, plays
 * as before the place was read -- without a place, at its volume:
 * (1) A node named `camera` that no placement of the map carries, rather than at its bare offset. Desert Glory's
 * `mp6_battlesounds` and Sandstorm's `mp73_battlesounds` place their near gunfire (`incoming`) at `camera` + (+-200,
 * 100, 0); whether `FUN_0026f4e0`'s lookup finds the game's own camera node by that name (then the sound plays 200 u
 * beside the listener, through its RANGE) or nothing (then at the bare offset by the map's corner, out of range) is not
 * read.
 * (2) A node a scene program holds at the camera -- the target (+6) of an `OBJECT_TRANSLATE_STATE` (18; tick
 * `FUN_00263890`, D:L111263ff) whose reference node (+7) is `camera`, or a node under one (`cameraFollowers`): every
 * offered map's sky (`translate_sky`, MP82's `move_sky`, MP52's `translate_dustfollow`; research 175 s5.1.1), looped
 * in an autostart, so the node stands at the camera each frame. `FUN_00310980` carries the place through the node's
 * matrix as it stands (D:L112446-112450, D:L212139-212147), so the original plays Sandstorm's `.EXP_DISTANT` (0x86) at
 * `skydome` + (300, 0, 1000), (-800, 0, -120), (-600, 0, -120) that far from the LISTENER; the port's node stands at its
 * rest (`SCENE_NODE_TRANSFORM_PLACEHOLDER`), where the place would be on the ground in the playable area ((640, 0, 1320)
 * and two more on MP73). Only MP73's and MP6's battle sounds sit at such a node (MP6's run by the effect runner, `./effects`).
 * [placeholder: (1) the node lookup's scope at run time; (2) the place at the listener plus the offset in the node's
 * frame, as the original's moving node gives it (LATER 894) -- settled by a closer reading of `FUN_00310980` with the
 * node's live matrix (the camera's frame or its position only, by `OBJECT_TRANSLATE_STATE`'s flags) and a capture of
 * Sandstorm's and Desert Glory's battle sounds.]
 */
export const SCENE_SOUND_CAMERA_NODE_PLACEHOLDER = 'unplaced' as const;

/**
 * SCENE_SOUND_MOVING_NODE_PLACEHOLDER: a placed `SOUND` (flag 2) at a node a scene program moves -- a gate's
 * `gate_moveN` (`~FENCE_GATE`, `.WOOD_DR_SLD_*` on MP11 and MP62; `./gates`), a crane's hook (`~CRANE` on MP81;
 * `./cranes`) -- plays at the node's REST origin plus its offset (`SCENE_SOUND_PLACE_READING`): only a door's move
 * reaches the world (`nodeMoved`). `FUN_00310980` reads the node's matrix as it stands (D:L112446-112450), so the
 * original's sound follows the moving gate or hook; until `agent/fh-seagulls` the port's followed the node's polygons as
 * the hull moved them (`placeOf`). [placeholder: the gates' and cranes' translation handed to `nodeMoved` (LATER 895);
 * a capture of an MP81 crane swing or an MP11 gate's slide, the sound's pan across the travel, settles it.]
 */
export const SCENE_SOUND_MOVING_NODE_PLACEHOLDER = 'restOrigin' as const;

/** `SOUND`'s flag 2: the command names its node at +0x10 (`FUN_002659c0` D:L112446). */
const SOUND_NODE = 0x2;

/**
 * DEBRIS_NODE_READING (XR-04, ruling PF.R29; research 213 s2.1, s2.3, s4): a node whose zAnim reference saves its parent
 * (bit 29, `MapInitial.saveParent`) is flown debris -- Crossroads' `part_1..15` under each arch's `parts` (0xbc08xx00)
 * and the bases' crate parts, the nodes `FOR_CHILDREN` reparents to the world (`OBJECT_MAKE_WORLDCHILD`) and `flyparts`
 * flies -- and a silent run (the room's, `ROOM_SKIP_EFFECTS_READING`) never turns one on, so the wire never carries it.
 * The bridges' programs hold no `IF skip_effects` around their debris (research 213 s2.1), so the guard the access
 * barriers use does not separate it [reading: that every save-parent node is presentation is read on Crossroads' two
 * arches and two bases only; the original's joiner (owner session B item 12) is not captured].
 */
export const DEBRIS_NODE_READING = 'saveParent' as const;

/**
 * COMMON_EFFECT_CALL_READING (XR-04; research 213 s2.1, s4): a `CALL_ANIMATION` whose animation the map's set lacks --
 * `*_demo_site1`'s `fire_explode_med` (twice) and `dust_explode_long`, the common set's (`CZANIM`) -- goes to the page's
 * effects by the `call` hook, at the calling program's root (an arch's `worldmodel/seal_demo_1`), on a presentation run
 * only; the room ignores it [reading: the command's own node byte (ref 3 `damage_point` in its payload, research 213
 * s2.1; `SCENE_INSTANCE_SCOPE_READING`) is not decoded, and the +0x18 f32 (30 up) is not applied].
 */
export const COMMON_EFFECT_CALL_READING = 'callerRoot' as const;

/** `tag_NODE_PARAMS`' `m_active` (bit 0) and `m_hasDI` (bit 12; `@s2u/scene` `probe.ts` `modelGate`). */
const NODE_ACTIVE = 1, NODE_HAS_DI = 1 << 12;

/**
 * SHOT_GEOMETRY_LIVE_READING (research 91 §23, research 209 §10): a round walks the world as it stands when it is
 * resolved. `FUN_003c9b70` (D:L319922-320065) walks the round's hits of this frame -- the projectile's own hit list
 * (`+0x28`), nearest first by `FUN_00309200`'s distances -- and hands each to `FUN_003c8920`, whose first act reads the
 * struck polygon's material off that hit (`FUN_002dc1d0`, D:L319383); nothing there reads a past state of the world.
 * Online each console walks the shooter's round on its own copy (`FUN_005abbc0` D:L464698, research 91 §23). This
 * reading covers that walk alone: the resolving console meets its own live world, `'present'`, the query `roundPath`
 * makes. Where the round is resolved is not the original's: the original's resolving console is the shooter's, whose
 * copy lags the host, while our room resolves geometry at its present and rewinds actors only (`match/src/room.ts`,
 * `MAX_REWIND_MS`) -- a barrier opening inside the rewind window passes a round the original's shooter would hit. That
 * is PF.R12, the ruled departure the owner holds (H100), not this reading. [reading: filed by #441 from research 91 §23
 * without the ELF; re-read at the decompilation on the owner's host by the takeover, 2026-10-24, pending review.]
 */
export const SHOT_GEOMETRY_LIVE_READING = 'present' as const;

/**
 * WORLD_RESET_SAVED_READING: the round's reset restores the active state of the nodes a reference saved (bit 28,
 * `MapInitial.saveActive`) and only those; a node no reference saves keeps the state the round left it in
 * [reading: `FUN_0026b430` D:L115690-115721 restores per saved reference; that no other path of `FUN_002ac0e0`
 * (D:L151976-151991) restores a node is not traced. Research 209 s10].
 */
export const WORLD_RESET_SAVED_READING = true;

/**
 * ROOM_SKIP_EFFECTS_READING (SUP-03): the room's world runs every scene program with `skip_effects` reading 1, as a
 * joiner's replay does (`WorldState.skipEffects`). What a program guards with `IF skip_effects == 0` is presentation --
 * Vigilance's and Desert Glory's `destroy_accessN` put their debris there (`bad_parts` on, the parts flown, `.WOOD_DEBRIS`;
 * research 176 s7.1, 209 s13) -- and the game's own late join replays the state without it (`FUN_002b4440`
 * D:L156767, `JOIN_SILENT_READING`, research 209 s11), so the state the room holds and sends never carries the debris; the page plays it
 * [reading: that no guarded branch on the 22 maps changes what is authoritative is read on the five sprint maps'
 * guarded programs only; research 210 s8].
 */
export const ROOM_SKIP_EFFECTS_READING = true;

/**
 * SI_SCRIPT_MOTION_PLACEHOLDER (LATER 409, research 237 §0.2 and §6): `OBJECT_MOTION_SI_SCRIPT` (command 26) moves
 * nothing and ends in the tick it begins -- its begin and tick are not read, only its record size and start/end times
 * (`FUN_0025f1b0` D:L108613-108635, `FUN_0025f3c0` D:L108678-108718; research 319 §4.2 U1 names it undecoded), and
 * MP6's six `f18_*.zan` `Script_Data` are 0 bytes. So Desert Glory's `f181` / `f182` turn the jet on and off in one
 * tick. Settled by reading command 26's begin and tick at the source -- `FUN_0025bc20`'s 26th registration
 * (D:L106890) pairs address `0x25f140` (inside `FUN_0025f050`'s range; not a decompiled function of its own) with `FUN_0025f050` (`FUN_0025f1b0`'s only caller, D:L108557), by analogy with the
 * 25th (D:L106889, opacity's begin and tick); that the 26th is command 26 is an inference (the name string at 0x3ece80
 * unread) -- and where the `.zan` bytes live if not in `Script_Data`.
 */
export const SI_SCRIPT_MOTION_PLACEHOLDER = 'returns at once' as const;

/**
 * SCENE_NODE_MOTION_PLACEHOLDER (V13-3c; research 386 §3.3, §3.5, §8; H99, PF.R29): a death's `OBJECT_MOTION` on a
 * placed map node -- MP12's `ant_part_fly1` on each of `ant_parts`' five parts (lifetime 5 s), `spinner_hit`'s on
 * `spinner_ant` (4 s), the Ruins tower's `tower_part_fly` -- flies the node in the original; the port draws no flight
 * (the world's drawing has no per-node transform). Where the program that moves it never turns that node off itself, a
 * page's run -- a death off the wire (PF.R26), or the page's own in offline play -- draws in the flight's stead the node fading from 1 to 0 over
 * the motion's own `lifetime` and gone from the drawing at its end -- a motion with a launch only (`FLIGHT_FLAGS`; a spin
 * or a turn in place, MP6's truck, draws nothing: the review's F1) -- the page's drawing only: the world's flags, the
 * room's and the wire's, are untouched, and the round's reset draws it back at opacity 1. Where the program turns it off
 * (Blizzard's `toilet_flypart1`, MP6's `crate_part_fly`: their own wait, fade and off) the motion draws nothing, as
 * before. The room's run, a display run (an autostart's spin, `spinner_ant_start`) and a joiner's silent state draw
 * nothing. Not the original's look: the part's flight, its landing and its resting place are not drawn. Settled by a
 * page-side flight of a placed node from the decoded motion (`@s2u/scene` `effectMotion.ts`) and a capture of the Ruins'
 * antenna blown (H421). DF-6 (research 175 §5.1.1): it covers the collision too -- the flown node's polygons ride its
 * flight in the original (the collider is the node's, research 281 §4.3, research 92 §2) and stay where they stood in
 * the port's hull, active (Desert Glory's 22 hp-1 props: an unseen cup or lamp still stops a round where it stood).
 */
export const SCENE_NODE_MOTION_PLACEHOLDER = 'fadeOverLifetime' as const;

/**
 * BOAT_ROCK_PLACEHOLDER (DF-9, research 387 §12): a scene program's `OBJECT_MOTION_FROM_TO` rotation (flag 0x40) on a
 * placed node is not run -- the node is drawn, and its polygons stand in the hull, where the disc places them. Fish
 * Hook's `boat_rocker1` / `boat_rocker2` (autostarts, flags 0x821) wait 1-2 s, then loop forever a 4 s slerp of the
 * rocker's rotation from one absolute quaternion to another and back (flags 0x60: the begin sets the start at +0x10,
 * `FUN_0025fe70` D:L109293-109297; the tick slerps by the elapsed time over +0x34 and sets the end, `FUN_0025f9b0`
 * D:L109016-109017, D:L108955) -- 1.36 and 1.31 degrees off no turn at all, a 2.67 degree swing. The setter writes the node's own rotation
 * whole (`FUN_00315790` -> `FUN_00307170` D:L206170ff), so the original replaces each rocker's disc yaw (26.9 and 147.0
 * degrees) with that rock at the first begin -- a reading, not watched. The hull: each rocker holds `boat_red`, 57
 * collision polygons; the original's collision is the node's (research 92 §2: the doors' leaves turn by the same
 * command and setter), so the deck would turn with it -- the transform the collision query reads is not traced. The
 * port draws and collides each boat still at its disc yaw, and its command ends at once (the loop spins to the effect
 * runner's guard each tick). Settled by a capture of both boats from the shore and a stand on one (H431's shape), and
 * the collision query's polygon transform read; then a fromTo case here and the hull's turned owners (`DoorSet`'s way).
 */
export const BOAT_ROCK_PLACEHOLDER = 'still' as const;

/**
 * SCROLL_MOTION_PLACEHOLDER (DF-9, research 387 §12; narrowed by LATER 782, §12.7): what of `SCROLL_MOTION` (command 24,
 * `@s2u/scene` op `scroll`) the port does not draw. Since LATER 782 the page's world runs the travel form (flag 8 clear;
 * `./sceneScroll` `scrollTick`: `FUN_00260fb0` D:L109681-109703, `FUN_00260b40` D:L109635-109674, the 1/4096 steps of
 * `FUN_003bfee0` D:L313770-313839) on the moving node's place (`WorldState.nodePlace`), and hands the offset to the
 * drawing (`WorldHooks.scroll`), which moves the texture of the scrolled node's world chunks (`MapMeta.motion.scrolled`,
 * `LoadedMesh.scrollPath`, `WorldView.setNodeUvOffset`): Fish Hook's six washes and its water, on MP71 and M71. Still
 * not drawn: (1) the projected form (flag 8, `FUN_00260b40` D:L109576-109631) -- MP52's `reflect_test`, whose mover is
 * its `camera`; (2) the scroll table's two other walks (flags 2 and 4, `FUN_003bfee0`'s `FUN_003bae40` / `FUN_003bada0`,
 * unread); (3) a scrolled node drawn as a prop rather than a world chunk -- M71's and M72's `tank_wheels` treads (which
 * nothing moves in the port), the common `bullet_advance` belt (no viewer source runs it); (4) a world chunk's detail and
 * environment passes, which keep the unscrolled coordinates where the original's re-run the scrolled vertices; (5) the
 * coordinate's 16-bit wrap on the vertex (the offset is kept whole; the shore's stays within a repeat). Settled by a
 * read of the walks and the projected form, and a capture of the shore (H226).
 */
export const SCROLL_MOTION_PLACEHOLDER = 'travelOnWorldChunks' as const;

/**
 * SCENE_NODE_TRANSFORM_PLACEHOLDER (DF-6; research 237 §6, 175 §5.1.1): a run's `OBJECT_TRANSLATE_STATE` (18),
 * `OBJECT_ROTATE_STATE` (19) or `OBJECT_MOTION_FROM_TO` (22) on a placed map node -- Desert Glory's `translate_sky` (the
 * dome held at the camera), `bug1..8` / `bee1..5` (their looped flights), `camera_jiggle` -- moves the node in the
 * original; the port's world has no per-node transform, so it draws nothing and the node stands where it was placed.
 * The callee's own -6 (a part-fly's reparenting before its `OBJECT_MOTION`) is `SCENE_NODE_MOTION_PLACEHOLDER`'s; the
 * jets (`f181` / `f182`) are `SI_SCRIPT_MOTION_PLACEHOLDER`'s. Settled by a page-side per-node transform (the same
 * build `SCENE_NODE_MOTION_PLACEHOLDER` owes, LATER 766's flight) from the decoded commands (research 106 §4's
 * motion, `FUN_0025f9b0` / `FUN_0025fe70`) and a capture of Desert Glory's sky and bees.
 */
export const SCENE_NODE_TRANSFORM_PLACEHOLDER = 'drawsNothing' as const;

/**
 * INVALIDATE_ANIMATION_READING (DF-6; research 175 §5.1.1; reading, pending review): `INVALIDATE_ANIMATION` (49, tick
 * `FUN_0025d2b0` D:L107355-107373) sets bit 0 of the named animation's instance `+0x34` (its own on all ten of
 * Desert Glory's), which `FUN_00270ef0` reads first at every start and refuses it (D:L119142); only the set's start
 * clears it (`FUN_0026c600` D:L116340-116344, to the flags' disabled bit: clear on Desert Glory's), and the round's reset
 * starts the sets again (`AUTOSTART_RESET_READING`, `FUN_002232a0` D:L75850-75866). So in a round a start of an
 * invalidated animation -- a call, a death, an action -- starts nothing; after the reset it starts again.
 */
export const INVALIDATE_ANIMATION_READING = { refusesLaterStarts: true, untilSetRestart: true } as const;

/**
 * The motions `SCENE_NODE_MOTION_PLACEHOLDER` fades: a launch -- `MOTION.FIXED_LAUNCH` (0x8), `RANDOM_LAUNCH` (0x10) or
 * `CALLER_VELOCITY` (0x800), the flags under which `@s2u/scene` `effectMotion.ts`'s tick moves the node (`FUN_00262690`
 * D:L110463, research 89 §2). A motion without one (a spin, `ANGULAR` 0x100; a roll) turns its node where it stands.
 */
const FLIGHT_FLAGS = MOTION.FIXED_LAUNCH | MOTION.RANDOM_LAUNCH | MOTION.CALLER_VELOCITY;

/**
 * PB-9b: a scene program's context in the world (`SceneRunContext`), with `display` -- a run for the page's drawing alone
 * (`WorldState.runDisplay`): its active commands draw, the world's own flags untouched.
 */
type WorldRunContext = SceneRunContext & {
  display?: boolean;
  /** AS-1: an autostart program. Its `RANDOM_WEIGHT` draws `WorldState.autostartRandom`. */
  autostart?: boolean;
  /**
   * The autostart this run is (or is called from), by name: when the effect runner already plays it (`ambientOwned`),
   * its sounds, calls and particles stay there; this run still applies `OBJECT_ACTIVE_STATE` to the world nodes.
   */
  autostartName?: string;
  /**
   * P8 (`SWITCH_PREDICT_ADAPTATION`; the P8 review's F2): the predicted press this run belongs to -- the token
   * `executeAction` was given, carried to every run it starts (a `CALL_ANIMATION` of the map's set, an
   * `EXECUTE_ACTION`) -- so a refusal drops the whole tree (`dropTree`).
   */
  tree?: object;
};

/** LATER 782: a node's frame where the meta holds none (a map built by hand). */
const IDENTITY16: readonly number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** A map with no metadata (a hull built by hand): no actions, no instances, nothing initially inactive. */
export function bareMeta(stem = ''): MapMeta {
  return { stem, actions: [], instances: [], instanceByPath: new Map(), initial: [], diagnostics: [] };
}

/**
 * A room's own copy of a hull (MAP-02; `match/src/server.ts` `forkSimMap`, `./net/loopback` `simMapOfLoaded`): its own
 * owners -- whose flags the room's world turns -- and its own points -- which the room's doors turn -- and the packed
 * fields copied too. Build the room's grid off the copy (`groundGrid`): the grid links the owner objects themselves.
 */
export function forkGround(g: GroundData): GroundData {
  return { grid: { ...g.grid }, owners: g.owners.map((o) => ({ ...o })), points: Float32Array.from(g.points), fields: Uint32Array.from(g.fields) };
}

export class WorldState {
  /** Each node's own flag, by path; a path not here is active (every node carrying polygons is, research 23 s1.1). */
  private readonly own = new Map<string, boolean>();
  /** The own flags after `applyInitial` (`InstanceState.initial`); empty before it. */
  private readonly initialOwn = new Map<string, boolean>();
  /** What `save` kept: the saved references' own flags (bit 28). */
  private saved = new Map<string, boolean>();
  /** Each owner's flag word as the hull had it, for setting bit 0 back on it. */
  private readonly base: (number | undefined)[];
  private readonly valves = new Map<string, number>();
  private readonly used = new Set<number>();
  private readonly hooks: WorldHooks[] = [];
  /** The moved nodes (`nodeMoved`): a path's move from its rest, row-major. */
  private readonly moves = new Map<string, number[]>();
  /** The nodes a program holds at the camera (`SCENE_SOUND_CAMERA_NODE_PLACEHOLDER` (2)); built at the first sound. */
  private followers: readonly string[] | null = null;
  /** MAP-06: the scene programs running (a death's sequence, an action's animation), with the action each runs for. */
  private runs: { run: EffectRun; action: number }[] = [];
  /** MAP-06: the map's destructibles and programs (`MapMeta.scene`; none on a map built by hand). */
  readonly scene: SceneMeta;
  /** MAP-06 (`./sceneHealth`): the scene objects' health, reset with the geometry. */
  readonly health: SceneHealth;
  /** XR-04 (`DEBRIS_NODE_READING`): the nodes a reference saves the parent of -- never turned on by a silent run. */
  private readonly debris: ReadonlySet<string>;
  /** PB-9b: the nodes a display run (`runDisplay`) has drawn on, which the world's own flags leave off. */
  private readonly displayed = new Set<string>();
  /** DF-6 (`INVALIDATE_ANIMATION_READING`): the animations invalidated this round, by name (case aside); none after the reset. */
  private readonly invalidated = new Set<string>();
  /** V13-3c (`SCENE_NODE_MOTION_PLACEHOLDER`): the nodes a death's motion has taken from the drawing, until the reset. */
  private readonly flown = new Set<string>();
  /** V13-3c: the motions fading now -- the node, the seconds run, the motion's lifetime. */
  private fading: { path: string; t: number; lifetime: number }[] = [];
  /** PB-9b: each node's last opacity a program wrote (the `opacity` hook's, `WorldView.setNodeOpacity`'s): `basePulse`. */
  private readonly opacities = new Map<string, number>();
  /**
   * LATER 782 (`SCENE_PROFILE_MOTION_READING`): each node's own translation as a program's stroke set it, by path; a path
   * not here stands at its own matrix's (`MapMeta.motion.frames`). Kept across the reset: no reference of the shore saves
   * a transform (research 387 §12.7).
   */
  private readonly translations = new Map<string, Vec3>();
  /**
   * LATER 782 (`SCROLL_MOTION_PLACEHOLDER`): each scrolled node's texture offset, in 1/4096ths (the steps `FUN_003bfee0`
   * adds to its visuals' vertices). Kept across the reset: the round's reset (`FUN_002ac0e0` D:L151976-151991) restores a
   * node only through what a reference saved (`FUN_0026c4f0`, `FUN_0026b430` D:L115690-115721; research 209): its
   * active state, parent, translation and rotation, as `FUN_0026b5e0` D:L115740-115807 saves them -- never a visual's
   * vertices, so the stepped texture coordinates stand [reading, under research 209's `WORLD_RESET_SAVED_READING`: the
   * rest of `FUN_002ac0e0`'s calls are not read for a vertex rebuild; research 387 s12.7].
   */
  private readonly uvOffsets = new Map<string, [number, number]>();
  /** P8's review F2: per predicted press (`WorldRunContext.tree`), each node's opacity before its runs first wrote it. */
  private readonly treeOpacity = new WeakMap<object, Map<string, number | undefined>>();
  /**
   * SUP-03: the deaths run with `skip_effects` reading 1 (`SceneRunContext.silent`): the room's world
   * (`ROOM_SKIP_EFFECTS_READING`); a page's runs its effects (false).
   */
  skipEffects = false;
  /**
   * AS-1 (research 237 §0.2): the page runs each autostart program after the opening fold (`startAutostarts`) -- the
   * set's start, `FUN_0026c600` D:L116360-116372, starting each animation the gate passes (`AUTOSTART_INITIAL_READING`,
   * research 115 R115.6's reading). The room leaves this unset -- the wire stays the opening state.
   */
  runAutostartPrograms = false;
  /**
   * The unit draw those programs' `RANDOM_WEIGHT` and ranged `WAIT`s take (`FUN_0025dcf0` D:L107783-107792, `rand() /
   * 2^31`). Other scene programs keep 0.5, the draw their tests were written against.
   */
  autostartRandom: () => number = Math.random;
  /**
   * LATER 409 F1: the effect runner's ambient effects (`EffectData.ambient`, lower case) -- the autostarts it plays,
   * found by `effectData.ts` `draws` over the map's set and the effect library (a `CALL_ANIMATION` into the common set
   * that draws). Null until the page hands them over (`setAmbient`); meanwhile the map's own programs decide
   * (`drawsAmbient`), which cannot see a library call.
   */
  private ambient: ReadonlySet<string> | null = null;

  constructor(readonly meta: MapMeta, readonly ground: GroundData, readonly grid: Grid, hooks?: WorldHooks) {
    this.base = ground.owners.map((o) => o.flags);
    if (hooks) this.hooks.push(hooks);
    this.scene = meta.scene ?? { destructibles: [], programs: [] };
    this.health = new SceneHealth(this.scene.destructibles, this);
    this.debris = new Set(meta.initial.filter((e) => e.saveParent).map((e) => e.path));
  }

  /** `Grid.revision`: what the cached readers compare against. */
  get revision(): number {
    return this.grid.revision;
  }

  /** Whether the node at `path` is active: its own flag and every ancestor's (`under`). */
  isActive(path: string): boolean {
    return activeIn(this.own, path);
  }

  /**
   * Sets the node at `path` active or not -- its own flag: every owner and placement under it follows (`under`: the
   * path, `path/`, `path=`), a descendant turned off on its own staying off. False when its flag already was `on`.
   */
  setActive(path: string, on: boolean): boolean {
    if ((this.own.get(path) ?? true) === on) return false;
    const was = new Map(this.own);
    this.own.set(path, on);
    this.sync(was, [path]);
    return true;
  }

  /**
   * zAnim's initial state (`FUN_0026b5e0` D:L115740-115750; `MapMeta.initial`): the bit-31 nodes made inactive, then the
   * bit-28 nodes' state saved (`save`). Called once, before the first spawn.
   */
  applyInitial(): void {
    const was = new Map(this.own);
    const changed: string[] = [];
    for (const e of this.meta.initial) {
      if (!e.deactivate || this.own.get(e.path) === false) continue;
      this.own.set(e.path, false);
      changed.push(e.path);
    }
    this.initialOwn.clear();
    for (const [path, on] of this.own) this.initialOwn.set(path, on);
    this.save();
    this.sync(was, changed, changed.length > 0);
    if (this.runAutostartPrograms) this.startAutostarts();
  }

  /** Saves the active state of every node a reference saves (bit 28; `FUN_0026b5e0`). */
  save(): void {
    this.saved = new Map(this.meta.initial.filter((e) => e.saveActive).map((e) => [e.path, this.own.get(e.path) ?? true]));
  }

  /**
   * The round's reset (`FUN_002ac0e0` D:L151976-151991): the saved nodes back to their saved state (`FUN_0026b430`,
   * WORLD_RESET_SAVED_READING), the action valves to 0, the running animations stopped and the uses cleared
   * (`FUN_002b5510` D:L157445-157456), the health with them (MAP-06: `FUN_00273960`, `FUN_00273ee0`); the revision
   * moves whatever changed. Then, as the original starts the sets again after its restore, every autostart's opening
   * `OBJECT_ACTIVE_STATE` commands are re-applied in order (`MapMeta.autostart`, `./mapMeta` `AUTOSTART_RESET_READING`):
   * a node no reference saves (MP73's `radio_call`, `chopper1`) is set as the restarted animation sets it.
   */
  reset(): void {
    // PB-9b: the running animations stopped first, as `FUN_002232a0` stops the sets (`FUN_0026c2e0`, D:L75851-75866)
    // before the saved references come back -- each stop runs its cleanup (`EffectRun.stop`): a base's pulse turns its
    // outline off.
    for (const r of [...this.runs]) r.run.stop();
    this.displayed.clear();
    this.unfly();
    const was = new Map(this.own);
    const changed: string[] = [];
    for (const [path, on] of this.saved) {
      if ((this.own.get(path) ?? true) === on) continue;
      this.own.set(path, on);
      changed.push(path);
    }
    // W0 (`./mapMeta` AUTOSTART_RESET_READING): the sets started again -- each autostart's opening commands, in order.
    for (const { path, on } of this.meta.autostart ?? []) {
      if ((this.own.get(path) ?? true) === on) continue;
      this.own.set(path, on);
      changed.push(path);
    }
    this.valves.clear();
    this.used.clear();
    this.invalidated.clear();                // DF-6: the sets' start clears +0x34 bit 0 (INVALIDATE_ANIMATION_READING)
    this.runs = [];
    this.health.reset();
    this.sync(was, changed, true);
    // AS-1: the sets started again (`FUN_0026c600`), the page's programs with them. The opening commands above are the
    // room's; the programs are not (`runAutostartPrograms`).
    if (this.runAutostartPrograms) this.startAutostarts();
  }

  /** An action valve's value (the short at `CValve+4`); 0 when never set. */
  valve(name: string): number {
    return this.valves.get(name) ?? 0;
  }

  setValve(name: string, v: number): void {
    this.valves.set(name, v);
  }

  /** Whether the action has been used this round (its `+0x3f` bit 1; `FUN_002b5510` clears it). */
  actionUsed(id: number): boolean {
    return this.used.has(id);
  }

  markUsed(id: number): void {
    this.used.add(id);
  }

  /** MAP-03's wire: every placed node whose own flag differs from its flag after `applyInitial`, in id order. */
  states(): InstanceState[] {
    const paths = new Set([...this.own.keys(), ...this.initialOwn.keys()]);
    const out: InstanceState[] = [];
    for (const path of paths) {
      const active = this.own.get(path) ?? true, initial = this.initialOwn.get(path) ?? true;
      if (active === initial) continue;
      const id = this.meta.instanceByPath.get(path);
      if (id !== undefined) out.push({ id, path, active, initial });
    }
    return out.sort((a, b) => a.id - b.id);
  }

  /**
   * A server's states (MAP-03's `applyWire`; `states()`'s list): each listed instance's own flag as listed, every other
   * node's back at its flag after `applyInitial` -- the list is the whole of how the world differs from its opening.
   * A live destructible whose target this turns off died in the room (`SCENE_DEATH_ON_WIRE_READING`; one a target, none
   * under another dead one's target): spent here, its death's sequences run for their effects once -- unless `silent`,
   * the game's `skip_effects` (a joiner's state); a spent one whose target it turns back on is whole again.
   */
  apply(states: readonly { id: number; active: boolean }[], silent: boolean): void {
    const want = new Map(this.initialOwn);
    for (const s of states) {
      const path = this.meta.instances[s.id]?.path;
      if (path !== undefined) want.set(path, s.active);
    }
    // SUP-02 (SCENE_DEATH_ON_WIRE_READING): the live destructibles before the room's state is laid on.
    const live = this.scene.destructibles.filter((d) => !this.health.isSpent(d.id) && this.isActive(d.targetPath));
    const gone = this.scene.destructibles.filter((d) => this.health.isSpent(d.id) && !this.isActive(d.targetPath));
    this.lay(want);
    for (const d of gone) if (this.isActive(d.targetPath)) this.health.revive(d.id);
    // The room ran one death where several records' targets went off: one a distinct target (the first record bound to
    // it, `SceneHealth.at`'s pick), none for a record whose target is under another's, and none for a record whose
    // animation another's death runs as a program (MP7's `ant_base1` calls `spinner_hit`; its record is not spent).
    const off = live.filter((d) => !this.isActive(d.targetPath));
    const called = new Map(off.map((d) => [d.id, this.runsOf(d.program)]));
    const died = off.filter((d, i) => off.findIndex((e) => e.targetPath === d.targetPath) === i
      && !off.some((e) => e.targetPath !== d.targetPath && under(d.targetPath, e.targetPath))
      && !off.some((e) => e !== d && called.get(e.id)!.has(d.anim.toLowerCase())));
    // PF.R26: the page's run is presentation only (`SceneRunContext.presentation`): nothing to lay back afterwards.
    for (const d of died) this.health.takeDeath(d.id, !silent);
  }

  /**
   * The animations a program runs, at any depth, by lower-case name: its `CALL_ANIMATION`s and its `EXECUTE_ACTION`s'
   * (the action whose valve it names, its first animation: `executeAction`).
   */
  private runsOf(program: EffectProgram): Set<string> {
    const out = new Set<string>();
    const walk = (p: EffectProgram): void => {
      for (const seq of p.sequences) {
        for (const op of seq.ops) {
          let name: string | undefined;
          if (op.op === 'call') name = op.anim;
          else if (op.op === 'executeAction') name = this.meta.actions.find((a) => a.valve.toLowerCase() === op.anim.toLowerCase())?.anims[0];
          if (name === undefined || out.has(name.toLowerCase())) continue;
          out.add(name.toLowerCase());
          const lib = this.program(name);
          if (lib) walk(lib.program);
        }
      }
    };
    walk(program);
    return out;
  }

  /** The own flags made `want`'s (absent: on), the drawing and the revision told of what changed. */
  private lay(want: ReadonlyMap<string, boolean>): void {
    const was = new Map(this.own);
    const changed: string[] = [];
    for (const path of new Set([...this.own.keys(), ...want.keys()])) {
      const on = want.get(path) ?? true;
      if ((this.own.get(path) ?? true) === on) continue;
      this.own.set(path, on);
      changed.push(path);
    }
    if (changed.length) this.sync(was, changed);
  }

  /**
   * MAP-03's wire (protocol 10, `./net/protocol` `EnvWire`): the world for a welcome or a snapshot -- the revision, the
   * round epoch the room names (`Room.roundSerial`), and the WHOLE of `states()` (never a delta: `apply` takes its list
   * as the whole difference, research 209 s8).
   */
  wireAll(epoch = 0): EnvWire {
    return { revision: this.revision, epoch: epoch & 0xffff, states: this.states().map((s) => ({ id: s.id, active: s.active })) };
  }

  /** A room's `EnvWire` laid on this world (`apply`; `silent` the game's `skip_effects`). The epoch is the caller's to check. */
  applyWire(env: EnvWire, silent: boolean): void {
    this.apply(env.states, silent);
  }

  /** One step of the world's running programs (MAP-06: the deaths' sequences, the actions' animations). */
  step(dt: number): void {
    for (const r of [...this.runs]) r.run.update(dt);
    this.runs = this.runs.filter((r) => !r.run.finished);
    this.stepFades(dt);
  }

  /**
   * V13-3c (`SCENE_DEATH_ON_WIRE_READING` 'targetOffOrTold'): a death the room told (`sceneDeath`; a joiner's welcome's
   * `sceneDead`, `silent`): the record spent and, unless silent, its sequences run for presentation
   * (`SceneHealth.takeDeath`, PF.R26). False when it was spent already -- the state's inference took it first, or the
   * room told it twice.
   */
  takeDeath(id: number, silent: boolean): boolean {
    return this.health.takeDeath(id, !silent);
  }

  /** `SceneHealth`'s: a death this world decided and ran (`WorldHooks.died`). */
  diedHere(id: number): void {
    for (const h of [...this.hooks]) h.died?.(id);
  }

  /**
   * Whether the node at `path` is drawn: active (`isActive`) and not taken from the drawing by a death's motion
   * (`SCENE_NODE_MOTION_PLACEHOLDER`), at or above it.
   */
  drawn(path: string): boolean {
    if (!this.isActive(path)) return false;
    for (const f of this.flown) if (under(path, f)) return false;
    return true;
  }

  /** `SCENE_NODE_MOTION_PLACEHOLDER`: each fading node's opacity on, and at its lifetime's end, gone from the drawing. */
  private stepFades(dt: number): void {
    if (this.fading.length === 0) return;
    const left: { path: string; t: number; lifetime: number }[] = [];
    for (const f of this.fading) {
      f.t += dt;
      if (f.t < f.lifetime) {
        for (const h of [...this.hooks]) h.opacity?.(f.path, 1 - f.t / f.lifetime);
        left.push(f);
        continue;
      }
      for (const h of [...this.hooks]) h.opacity?.(f.path, 0);
      this.flown.add(f.path);
      this.emit(f.path, false);
    }
    this.fading = left;
  }

  /** The round's reset of `SCENE_NODE_MOTION_PLACEHOLDER`: each faded or fading node drawn again, at opacity 1. */
  private unfly(): void {
    const paths = new Set([...this.flown, ...this.fading.map((f) => f.path)]);
    this.flown.clear();
    this.fading = [];
    for (const path of paths) {
      for (const h of [...this.hooks]) h.opacity?.(path, 1);
      this.emit(path, this.isActive(path));
    }
  }

  /** Whether a scene program is running (a death's sequence, an action's animation). */
  get busy(): boolean {
    return this.runs.some((r) => !r.run.finished);
  }

  /** The set's program by name (case aside): the first of the name (`MapMeta.scene`). */
  program(name: string): SceneProgram | undefined {
    const n = name.toLowerCase();
    return this.scene.programs.find((p) => p.program.name.toLowerCase() === n);
  }

  /**
   * Starts a scene program with its context (`FUN_00272bb0`): its timeless head runs now, as the game's first tick, the
   * rest at `step`. `action` is the `MapMeta.actions` index it runs for (`executeAction`), -1 for none. Null, and
   * nothing run, when the program was invalidated this round (`INVALIDATE_ANIMATION_READING`: `FUN_00270ef0` D:L119142).
   */
  runProgram(program: EffectProgram, ctx: WorldRunContext, action = -1): EffectRun | null {
    if (this.invalidated.has(program.name.toLowerCase())) return null;
    const run = new EffectRun(program, this.sceneHost, ctx);
    this.runs.push({ run, action });
    run.update(0);
    return run;
  }

  /**
   * PB-9b (research 284 s3, s8; ruling PB2.R5): a program of the set run for the page's drawing alone -- the bases'
   * `pulse_terrorist` / `pulse_seal`, which the map's `objectives` calls on the bomb's pickup (`./bombPage` `worldPulse`).
   * Its `OBJECT_ACTIVE_STATE` draws its node (`visible`) and leaves the world's own flags -- the wire's state, the
   * room's -- as they are; its `OBJECT_OPACITY_FROM_TO` reaches the `opacity` hook. Its references are placed over the
   * world (`placeRefs`, no scope). False when the set has no program of the name (a Breach map's `pulse_seal`: nothing
   * drawn, research 284 s5) or one of it still runs: a call of a running animation starts none (`FUN_002734b0`
   * D:L120717-120801, `FUN_00270ef0` D:L119201). Presentation only: the room runs none (`ROOM_SKIP_EFFECTS_READING`).
   * BASE_PULSE_MISSING_CALL_READING (research 284 s5, s7; a note, no constant): a Breach map's `bomb_owner == 2` pickup
   * calls the `pulse_seal` its set lacks; read as nothing drawn -- the false return here -- `FUN_0025d5c0`'s miss path
   * (D:L107485ff) not read.
   */
  runDisplay(name: string): boolean {
    const lib = this.program(name);
    if (!lib || this.running(name)) return false;
    const nodes = placeRefs(this.meta, lib.program.nodes, lib.search, lib.program.root, null, lib.parents);
    // DF-6 review F2: an animation invalidated this round starts nothing (INVALIDATE_ANIMATION_READING): false.
    return this.runProgram(lib.program, { root: nodes[lib.program.root] ?? null, nodes, caller: null, valve: null, silent: false, display: true }) !== null;
  }

  /**
   * PB-9b's development read (`./hook` `ViewerHook.basePulse`; an instrument, no behaviour): the display runs going now
   * (`runDisplay`: the bases' pulse), by program name, and each node a display run draws now (`display`) at the last
   * opacity a program wrote it. Empty after a drop (the stop's cleanup turns the outline off) and after the reset.
   */
  basePulse(): { running: string[]; opacity: Record<string, number> } {
    const running = this.runs.filter((r) => !r.run.finished && (r.run.context as WorldRunContext).display === true).map((r) => r.run.program.name);
    const opacity: Record<string, number> = {};
    for (const path of this.displayed) { const f = this.opacities.get(path); if (f !== undefined) opacity[path] = f; }
    return { running, opacity };
  }

  /**
   * The forge's placed plant sites' outlines (`./forge/siteOutlines`; a browser adaptation, FG.R2): a node no program of
   * the set names, drawn on or off for the page alone (no world flag of its own: the map's scene does not hold it). What
   * `./bombPage` `worldPulse` drives where the map's `objectives` has no outline of its own to light.
   */
  displayNode(path: string, on: boolean): void {
    if (on) this.displayed.add(path); else this.displayed.delete(path);
    this.emit(path, on);
  }

  /** `displayNode`'s opacity: the node's opacity now, as a display run's `OBJECT_OPACITY_FROM_TO` writes it. */
  displayOpacity(path: string, opacity: number): void {
    this.opacities.set(path, opacity);
    for (const h of [...this.hooks]) h.opacity?.(path, opacity);
  }

  /** LATER 782: the node's own translation as a stroke last set it (`SCENE_PROFILE_MOTION_READING`), or null (none ran). */
  nodeTranslation(path: string): Vec3 | null {
    const t = this.translations.get(path);
    return t ? [...t] : null;
  }

  /** LATER 782: the scrolled node's texture offset, in texture repeats (`WorldHooks.scroll`), or null (no scroll moved it). */
  scrollOffset(path: string): [number, number] | null {
    const o = this.uvOffsets.get(path);
    return o ? [o[0] / 4096, o[1] / 4096] : null;
  }

  /** LATER 782: the node's frame (`MapMeta.motion.frames`), the identity at the origin for a node the meta has none of. */
  private frameOf(path: string): NodeFrame {
    const f = this.meta.motion?.frames.get(path);
    return f ? new NodeFrame(f.own, f.world) : new NodeFrame(IDENTITY16, IDENTITY16);
  }

  /** Whether a program of the name (case aside) is running. */
  running(name: string): boolean {
    const n = name.toLowerCase();
    return this.runs.some((r) => !r.run.finished && r.run.program.name.toLowerCase() === n);
  }

  /**
   * `STOP_ANIMATION` from the page (PB-9b: `bomb_drop`'s, research 284 s3): every running program of the name stopped,
   * its cleanup run (`EffectRun.stop`; `FUN_0025d490` D:L107435-107462 -> `FUN_002707c0` D:L118829ff).
   */
  stopProgram(name: string): void {
    const n = name.toLowerCase();
    for (const r of [...this.runs]) if (!r.run.finished && r.run.program.name.toLowerCase() === n) r.run.stop();
    this.runs = this.runs.filter((r) => !r.run.finished);
  }

  /**
   * `EXECUTE_ACTION` (174 s3): the action whose valve is `valve` (`FUN_002b4e80`, `MapMeta.actions`, case aside) runs its
   * animation with its node and its valve as the context (`FUN_002b44e0`) -- refused while that action's animation
   * still runs (D:L156787), and (XR-04) once it was used this round (`markUsed`: a switch runs once a round; the game
   * hides the switch, research 213 s4). `silent` is a joiner's replay (`skip_effects` reads 1), the room's own world's
   * by default (`skipEffects`, ROOM_SKIP_EFFECTS_READING); `presentation` a page's run of the room's (PF.R26). True when
   * it started.
   */
  executeAction(valve: string, silent = this.skipEffects, presentation = false, tree?: object): boolean {
    const v = valve.toLowerCase();
    const i = this.meta.actions.findIndex((a) => a.valve.toLowerCase() === v);
    if (i < 0 || this.used.has(i) || this.runs.some((r) => r.action === i && !r.run.finished)) return false;
    const a = this.meta.actions[i]!;
    const lib = this.program(a.anims[0] ?? '');
    if (!lib) return false;
    const nodes = placeRefs(this.meta, lib.program.nodes, lib.search, lib.program.root, a.path, lib.parents);
    // DF-6 review F2: an animation invalidated this round starts nothing (INVALIDATE_ANIMATION_READING): false.
    return this.runProgram(lib.program, { root: nodes[lib.program.root] ?? null, nodes, caller: a.path, valve: a.valve, silent, presentation, ...(tree ? { tree } : {}) }, i) !== null;
  }

  /**
   * P8 (`SWITCH_PREDICT_ADAPTATION`, `./actionPage`): every run of the predicted press `tree` (the token given to
   * `executeAction`) dropped where it stands -- its own, the programs of the set it called and the actions it executed
   * (the P8 review's F2) -- with no further command and no cleanup sequence, so nothing more is heard, when the room
   * refused the press. A presentation run changes no node or valve (PF.R26); the opacity it wrote is put back, each
   * node to its value before the tree first wrote it (1, the node's own, where none was written), and the drawing told.
   * A network adaptation with no original (the original has no refusal to run back).
   */
  dropTree(tree: object): void {
    this.runs = this.runs.filter((r) => r.run.finished || (r.run.context as WorldRunContext).tree !== tree);
    const before = this.treeOpacity.get(tree);
    if (!before) return;
    this.treeOpacity.delete(tree);
    for (const [path, was] of before) {
      if (was === undefined) this.opacities.delete(path); else this.opacities.set(path, was);
      for (const h of [...this.hooks]) h.opacity?.(path, was ?? 1);
    }
  }

  /**
   * AS-1: every animation that starts with its set (`AUTOSTART_INITIAL_READING`, `params.flags & 3 == 1`), except the
   * mode script `objectives`. The room already runs that script (round cues, the bomb, extraction; research 237 HX.R6,
   * research 174 LATER 149). A second copy would post its lines and music beside the room's. Browser adaptation: it
   * does not change the round. Each other program runs for the drawing (`display`, `presentation`: PF.R26 -- active
   * commands draw, valves are not written, the wire's own flags stay the opening fold). A program the effect runner
   * already plays (`ambientOwned`) keeps its sounds and calls there.
   */
  private startAutostarts(): void {
    for (const lib of this.scene.programs) {
      if (!AUTOSTART_INITIAL_READING.startsWithSet(lib.program.flags)) continue;
      if (lib.program.name.toLowerCase() === 'objectives') continue;
      if (this.running(lib.program.name)) continue;
      const nodes = placeRefs(this.meta, lib.program.nodes, lib.search, lib.program.root, null, lib.parents);
      this.runProgram(lib.program, {
        root: nodes[lib.program.root] ?? null, nodes, caller: null, valve: null, silent: false,
        display: true, presentation: true, autostart: true,
        autostartName: lib.program.name,
      });
    }
  }

  /**
   * LATER 409 F1: the effect runner's ambient effects (`EffectData.ambient`), or null (none landed). Read at each
   * command, so a run started before the effect data landed (`./main` asks for it once the map is shown) leaves its
   * sounds and calls to the effect runner from then on.
   */
  setAmbient(names: readonly string[] | null): void {
    this.ambient = names ? new Set(names.map((n) => n.toLowerCase())) : null;
  }

  /** Whether the effect runner already plays the autostart `ctx` runs for (`setAmbient`, else `drawsAmbient`). */
  private ambientOwned(ctx: WorldRunContext): boolean {
    const name = ctx.autostartName;
    if (name === undefined) return false;
    return this.ambient ? this.ambient.has(name.toLowerCase()) : drawsAmbient(this.scene.programs, name);
  }

  /**
   * The host the scene programs run on (`./effectRunner`; the `DoorSet` host is the model): `OBJECT_ACTIVE_STATE` on the
   * world's nodes, `VALVE` on its valves (the context's with flag bit 0), `EXECUTE_ACTION`, `CALL_ANIMATION` at the
   * caller's root (`SCENE_INSTANCE_SCOPE_READING`), the effects to the hooks.
   */
  private readonly sceneHost: EffectHost = {
    random: (run) => ((run.context as WorldRunContext).autostart ? this.autostartRandom() : 0.5),
    test: (c: EffectCondition, run: EffectRun): boolean => {
      if (c.kind !== 'valve') return false;
      const ctx = run.context as SceneRunContext, name = c.context ? ctx.valve : c.valve;
      return valveTest(name === null ? 0 : this.valveIn(ctx, name), c.operation, c.operand);
    },
    begin: (op: EffectOp, run: EffectRun) => {
      const ctx = run.context as WorldRunContext;
      const at = (node: number): string | null => (node === NODE_ROOT ? ctx.root : node === NODE_CALLER ? ctx.caller : ctx.nodes[node] ?? null);
      switch (op.op) {
        // PF.R26: a presentation run (a page's death off the wire) turns no node and sets no valve; an action it executes
        // runs as presentation too (Vigilance's sound lives in the action's destroy program).
        // XR-04 (DEBRIS_NODE_READING, PF.R29): a silent run never turns flown debris on.
        case 'active': {
          const p = at(op.node);
          if (p !== null && ctx.display) { this.display(p, op.on); return; }
          if (p !== null && !ctx.presentation && !(ctx.silent && op.on && this.debris.has(p))) this.setActive(p, op.on);
          return;
        }
        // PB-9b: a node's opacity, to the drawing (`FUN_0025f960` / `FUN_0025f880`, `opacityTick`); a node not placed
        // ends the command at once, as `FUN_0025f880` does with no node (D:L108815-108817).
        case 'opacity': {
          const p = at(op.node);
          if (p === null) return;
          const tree = ctx.tree;
          if (tree) {
            // P8's review F2: what the drop of a refused press puts back.
            let before = this.treeOpacity.get(tree);
            if (!before) this.treeOpacity.set(tree, before = new Map());
            if (!before.has(p)) before.set(p, this.opacities.get(p));
          }
          return opacityTick(op, (f) => { this.opacities.set(p, f); for (const h of [...this.hooks]) h.opacity?.(p, f); });
        }
        case 'valve': {
          if (ctx.presentation) return;
          const name = op.context ? ctx.valve : op.valve;
          if (name !== null) this.setValve(name, valveApply(this.valveIn(ctx, name), op.operation, op.operand));
          return;
        }
        case 'executeAction': this.executeAction(op.anim, ctx.silent, ctx.presentation === true, ctx.tree); return;
        case 'call': {
          if (this.ambientOwned(ctx)) return;
          // Research 386 §3.3: flag 4 hands the callee the node at +9 as its NODE_CALLER (`FUN_0025d5c0` D:L107605-107613,
          // a type-3 context entry; `FUN_0026f4e0` D:L118164-118168) -- none when it names no placed node (no entry made);
          // without the flag the caller's own is passed on. Blizzard's `toilet_flypart1` fades and turns off its own part.
          this.callAnimation(op.anim, ctx, op.caller === undefined ? ctx.caller : at(op.caller));
          return;
        }
        case 'sound':
          if (this.ambientOwned(ctx)) return;
          // An autostart's `~` loop is the audio's emitter's (`@s2u/sound` `zanimEmitters`: placed, looped, with RANGE),
          // as the effect runner's ambient runs leave theirs (`./effects`); played here too, it sounded once, unplaced, at
          // the match's start (MP71's dogs, chimes and waves). The skip mirrors `zanimEmitters`: a program that starts with
          // its set (`AUTOSTART_INITIAL_READING`), however its run is reached -- its own, or another autostart's call. The
          // world no longer suppresses the `~` of a called program that is not one (MP81's `sound_hook_N`): no emitter holds
          // it. Whether the crane's `~CRANE` is played at all stays `CRANE_SOUND_PLACEHOLDER`'s question (`./cranes`).
          if (ctx.autostart && AUTOSTART_INITIAL_READING.startsWithSet(run.program.flags) && op.sound.startsWith('~')) return;
          if (op.newPlay === false) return;
          {
            // Flag 2 names the node (a hand-built op, with no flags, names it when it names one).
            const node = op.flags === undefined || (op.flags & SOUND_NODE) !== 0 ? at(op.node) : null;
            const place = this.soundPlace(op, node, op.flags !== undefined && (op.flags & SOUND_NODE) !== 0 ? run.program.nodes[op.node] : undefined);
            for (const h of [...this.hooks]) h.sound?.(op.sound, at(op.node) ?? ctx.root, op.volume, place);
          }
          return;
        case 'particles':
          if (this.ambientOwned(ctx)) return;
          for (const h of [...this.hooks]) h.particles?.(op.source, ctx.root);
          return;
        case 'destruction': for (const h of [...this.hooks]) h.destruction?.(at(op.node) ?? ctx.root); return;
        // Research 386 §3.2 (LATER 63): the room's round (`WorldHooks.fire`); a presentation or a display run fires none.
        case 'fireWeapon': {
          if (ctx.presentation || ctx.display) return;
          const path = op.node === 0 ? null : at(op.node);
          if (op.node !== 0 && path === null) return;                 // a node no placement carries: no round
          for (const h of [...this.hooks]) h.fire?.(op, path);
          return;
        }
        // DF-6 (INVALIDATE_ANIMATION_READING): the named animation, or this one, refuses its later starts this round.
        case 'invalidate': this.invalidated.add((op.anim ?? run.program.name).toLowerCase()); return;
        // DF-6 (SCENE_NODE_TRANSFORM_PLACEHOLDER): a placed node's translate, rotate or from-to draws nothing -- but
        // (LATER 782, SCENE_PROFILE_MOTION_READING) a speed-profile stroke from a given start moves the node's own
        // translation here, which a SCROLL_MOTION reads (Fish Hook's `water_node*`). BOAT_ROCK_PLACEHOLDER: a rotation
        // is not run.
        case 'translate': case 'rotate': return;
        case 'fromTo': {
          const p = at(op.node);
          if (p === null || !runsProfileStroke(op)) return;
          const rest = this.frameOf(p).rest;
          return profileStrokeTick(op, {
            get: () => [...(this.translations.get(p) ?? rest)],
            set: (t) => { this.translations.set(p, [...t]); },
          });
        }
        // SCENE_NODE_MOTION_PLACEHOLDER (V13-3c): a page's presentation run of a death draws, in the flight's stead, the
        // node fading over the motion's lifetime and gone at its end -- unless its program turns that node off itself.
        // The command still ends at once, as every motion did before: what follows it in the sequence is not held.
        case 'motion': {
          // The review's F2: a page's own death (offline play, `SceneHealth.apply` on a world whose `skipEffects` is
          // false) fades too; the room's runs are silent (`ROOM_SKIP_EFFECTS_READING`) and draw nothing.
          if (ctx.display || ctx.silent) return;
          const m = op.motion, p = at(m.node);
          // The review's F1: a flight only -- a launch (`effectMotion.ts`'s tick moves the node only under these flags);
          // a spin or a turn in place (MP6's `truck_rotate_parts`, the bases' `fire_effects`) stays drawn.
          if ((m.flags & FLIGHT_FLAGS) === 0) return;
          if (p === null || !(m.lifetime > 0) || this.flown.has(p) || this.fading.some((f) => f.path === p)) return;
          if (run.program.sequences.some((s) => s.ops.some((o) => o.op === 'active' && !o.on && o.node === m.node))) return;
          this.fading.push({ path: p, t: 0, lifetime: m.lifetime });
          for (const h of [...this.hooks]) h.opacity?.(p, 1);
          return;
        }
        // LATER 782 (SCROLL_MOTION_PLACEHOLDER): the travel form, its node's visuals moved by its mover's travel -- a
        // node not placed ends it at once, as `FUN_00260b40` does (D:L109562-109570); the projected form ends at once.
        case 'scroll': {
          const node = at(op.node), mover = at(op.mover);
          if (node === null || mover === null || !runsScroll(op)) return;
          const frame = this.frameOf(mover);
          const axis = frame.direction(op.axis);
          return scrollTick(op, {
            place: () => frame.place(this.translations.get(mover) ?? frame.rest),
            axis: () => axis,
          }, (su, sv) => {
            const o: [number, number] = this.uvOffsets.get(node) ?? [0, 0];
            o[0] += su; o[1] += sv;
            this.uvOffsets.set(node, o);
            for (const h of [...this.hooks]) h.scroll?.(node, o[0] / 4096, o[1] / 4096);
          });
        }
        // SI_SCRIPT_MOTION_PLACEHOLDER (AS-1): `OBJECT_MOTION_SI_SCRIPT` (command 26) falls here too -- no motion, done
        // in the tick it begins (its begin and tick unread).
        default: return;
      }
    },
  };

  /**
   * A `CALL_ANIMATION` of the set's animation `name` from a run of context `ctx` (`FUN_0025d5c0`), its callee's
   * NODE_CALLER `caller`: the one path a scene program's call and a door program's (`doorCall`) take. The callee's
   * references placed under the caller's root (`SCENE_INSTANCE_SCOPE_READING`), its run the caller's context otherwise.
   * False when the set has no animation of the name -- the page's effect then (`COMMON_EFFECT_CALL_READING`), on a
   * presentation run, at the caller's root.
   */
  private callAnimation(name: string, ctx: WorldRunContext, caller: string | null): boolean {
    const lib = this.program(name);
    if (!lib) { if (ctx.presentation) for (const h of [...this.hooks]) h.call?.(name, ctx.root); return false; }
    const nodes = placeRefs(this.meta, lib.program.nodes, lib.search, lib.program.root, ctx.root, lib.parents);
    this.runProgram(lib.program, { ...ctx, root: nodes[lib.program.root] ?? null, nodes, caller });
    return true;
  }

  /**
   * DF-4 (`./doors` `DOOR_CALL_READING`): a door program's `CALL_ANIMATION` of `name` (`DoorHooks.call`) run on this
   * world as a scene program's is (`callAnimation`), with NO context: the door's program runs with its node and valve
   * (`FUN_00272bb0`, research 92 s2), but `FUN_0025d5c0` hands the callee an entry only per flag bit it finds (bit 1
   * copies the running context, D:L107577-107593; 2, 4, 8 a node each) and MP6's two calls carry flags 0, so the callee
   * starts with none (`FUN_002734b0(anim, 0)`, D:L107763-107765): no caller, no context valve, no root (`door` is kept
   * for the reader). `skip_effects` as this world reads it (`skipEffects`: the room's, ROOM_SKIP_EFFECTS_READING).
   * MP6's `okforhostages` / `not_okforhostages` turn the jail bars (research 175 s5.1). False when the set has no
   * animation of the name: nothing runs.
   */
  doorCall(_door: { path: string; valve: string }, name: string): boolean {
    return this.callAnimation(name, { root: null, nodes: [], caller: null, valve: null, silent: this.skipEffects }, null);
  }

  /**
   * PB-9b: a display run's `OBJECT_ACTIVE_STATE` (`runDisplay`): the node drawn on while every ancestor is active, or
   * drawn as the world's own flags have it when turned off.
   */
  private display(path: string, on: boolean): void {
    if (on) this.displayed.add(path); else this.displayed.delete(path);
    const ancestors = [...this.own].every(([root, own]) => own || root === path || !under(path, root));
    this.emit(path, on ? ancestors : this.isActive(path));
  }

  /** A valve as a program reads it: `skip_effects` is 1 in a joiner's replay (`SceneRunContext.silent`). */
  private valveIn(ctx: SceneRunContext, name: string): number {
    return ctx.silent && name.toLowerCase() === SKIP_EFFECTS_VALVE ? 1 : this.valve(name);
  }

  /**
   * Where a program's `SOUND` plays (`SCENE_SOUND_PLACE_READING`): the command's offset (flag 4), through `path`'s world
   * matrix (`MapMeta.worlds`) and the move of the nearest moved node at or above it (`nodeMoved`) when `path` is placed;
   * the bare offset when it is not; null -- no place -- with neither. `name` is the node's name in the program when the
   * command names one by flag 2 (`SCENE_SOUND_CAMERA_NODE_PLACEHOLDER`). A node at or under one the camera carries
   * (`cameraFollowers`) has no place (the same placeholder).
   */
  private soundPlace(op: { offset?: readonly number[] }, path: string | null, name?: string): [number, number, number] | null {
    if (path !== null && this.cameraFollowers().some((f) => under(path, f))) return null; // SCENE_SOUND_CAMERA_NODE_PLACEHOLDER
    const world = path === null ? undefined : this.meta.worlds?.get(path);
    if (!world) {
      if (name?.toLowerCase() === 'camera') return null;                // SCENE_SOUND_CAMERA_NODE_PLACEHOLDER
      return op.offset ? [op.offset[0]!, op.offset[1]!, op.offset[2]!] : null;
    }
    const [x, y, z] = op.offset ?? [0, 0, 0];
    let p = apply4(world as number[], x!, y!, z!);
    let mover: string | null = null;
    for (const m of this.moves.keys()) if (under(path!, m) && (mover === null || m.length > mover.length)) mover = m;
    if (mover !== null) p = apply4(this.moves.get(mover)!, p[0], p[1], p[2]);
    return p;
  }

  /**
   * The placed nodes the map's scene programs hold at the camera: each `OBJECT_TRANSLATE_STATE` whose reference node
   * (+7) is `camera` (`FUN_00263890`: the node takes the reference's world position), its node (+6) placed as the
   * program's autostart run places it (`placeRefs`, no scope). Found from the data on every map: MP6/MP71/MP83's
   * `skydome`s, MP73's `skydome` and `flashes`, MP8's `skydome` and `stars`, MP9/MP12/MP82's `sky`, MP51's
   * `mp51_skydome`, MP52's `mp52_dustfollow`, MP53's `sky` and `thesun`, MP72's `mp72_sky` and `dust`, MP81's `skyplane`.
   */
  private cameraFollowers(): readonly string[] {
    if (this.followers) return this.followers;
    const out = new Set<string>();
    for (const lib of this.scene.programs) {
      const p = lib.program;
      const moves = p.sequences.flatMap((q) => q.ops).filter((o) => o.op === 'translate' && p.nodes[o.ref]?.toLowerCase() === 'camera');
      if (!moves.length) continue;
      const nodes = placeRefs(this.meta, p.nodes, lib.search, p.root, null, lib.parents);
      for (const o of moves) if (o.op === 'translate' && nodes[o.node]) out.add(nodes[o.node]!);
    }
    return (this.followers = [...out]);
  }

  /**
   * A node moved from its rest -- a door's leaf (`DoorPage`'s `move`, the `DoorSet`'s `inv(W0) W`, row-major): every
   * placement at or under `path` stands moved by `delta` (`soundPlace`; `FUN_00310980` reads each node's matrix as it is
   * now). The latest move a path, kept until the next.
   */
  nodeMoved(path: string, delta: ArrayLike<number>): void {
    this.moves.set(path, Array.from(delta));
  }

  /**
   * The centre of the box of the polygons at or under `path`, where they stand now in the hull; null when none are: a
   * common-set effect's place (the `call` hook, `COMMON_EFFECT_CALL_READING`). Was also the sound's place, until
   * `SCENE_SOUND_PLACE_READING` read the node's origin.
   */
  placeOf(path: string): [number, number, number] | null {
    const polys = groundPolygons(this.ground);
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const o of this.ground.owners) {
      if (!under(o.path, path)) continue;
      for (const p of polys.slice(o.first, o.first + o.count)) {
        for (let k = 0; k < p.points.length; k += 3) {
          for (let a = 0; a < 3; a++) { lo[a] = Math.min(lo[a]!, p.points[k + a]!); hi[a] = Math.max(hi[a]!, p.points[k + a]!); }
        }
      }
    }
    if (lo[0] === Infinity) return null;
    return [(lo[0]! + hi[0]!) / 2, (lo[1]! + hi[1]!) / 2, (lo[2]! + hi[2]!) / 2];
  }

  /** Hooks the world on; the returned function unhooks it. */
  on(hook: WorldHooks): () => void {
    this.hooks.push(hook);
    return () => {
      const i = this.hooks.indexOf(hook);
      if (i >= 0) this.hooks.splice(i, 1);
    };
  }

  /**
   * After own flags changed (`was` before): every owner's bit 0 set to its node's activity, the drawing told -- a path
   * turned on and active shown, then the nodes still off under it hidden again; a path turned off hidden -- and the
   * revision moved.
   */
  private sync(was: ReadonlyMap<string, boolean>, changed: readonly string[], bump = changed.length > 0): void {
    const owners = this.ground.owners;
    // R4B-09 (research 383): a node r0004 switched off at load stays off, whatever the zAnim references say.
    for (let i = 0; i < owners.length; i++) setOwnerActive(owners[i]!, this.base[i], !owners[i]!.switchedOff && activeIn(this.own, owners[i]!.path));
    const off = [...this.own].filter(([, on]) => !on).map(([path]) => path);
    for (const path of changed) {
      const on = this.own.get(path) ?? true;
      if ((was.get(path) ?? true) === on) continue;
      if (!on) { this.emit(path, false); continue; }
      if (!this.isActive(path)) continue;                     // an ancestor is still off: it stays hidden
      this.emit(path, true);
      // PB-9b: a node a display run has on stays drawn (`display`).
      for (const r of off) if (r !== path && under(r, path) && !this.displayed.has(r)) this.emit(r, false);
      // V13-3c (`SCENE_NODE_MOTION_PLACEHOLDER`): a node a death's motion took from the drawing stays out of it.
      for (const r of this.flown) if (under(r, path)) this.emit(r, false);
    }
    if (!bump) return;
    this.grid.revision++;
    for (const h of [...this.hooks]) h.changed?.(this.grid.revision);
  }

  private emit(path: string, on: boolean): void {
    for (const h of [...this.hooks]) h.visible?.(path, on);
  }
}

/**
 * `effectData.ts` `draws` over the map's own programs only: an autostart the effect runner already starts, because it or
 * a program it calls (four deep) draws particles or a light. Research 89 §12. The fallback until `setAmbient`: a call
 * into the effect library is not seen here.
 */
function drawsAmbient(programs: readonly SceneProgram[], name: string, depth = 0): boolean {
  const p = programs.find((x) => x.program.name.toLowerCase() === name.toLowerCase());
  if (!p || depth > 4) return false;
  return p.program.sequences.some((s) => s.ops.some((o) =>
    o.op === 'particles' || o.op === 'light' || (o.op === 'call' && drawsAmbient(programs, o.anim, depth + 1))));
}

/** Whether `path` and every ancestor of it are on in `own` (a path absent is on). */
function activeIn(own: ReadonlyMap<string, boolean>, path: string): boolean {
  for (const [root, on] of own) if (!on && under(path, root)) return false;
  return true;
}

/**
 * An owner's flag word for its node's activity: the hull's word with bit 0 set when active -- every node that carries
 * polygons on the 22 maps is active on the disc (research 23 s1.1, counted 2026-09-28), so the set bit is the disc's,
 * whatever a hull copied from a turned one carries -- and cleared when not. An owner inferred without the graph (no word)
 * keeps none while active (the gate's pass) and takes `m_hasDI` alone while not.
 */
function setOwnerActive(owner: CollisionOwner, base: number | undefined, on: boolean): void {
  if (base === undefined && on) { delete owner.flags; return; }
  const word = base ?? NODE_HAS_DI;
  owner.flags = on ? word | NODE_ACTIVE : word & ~NODE_ACTIVE;
}
