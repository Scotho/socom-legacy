import { Matrix4 } from 'three';
import { handAnim, PLACE_CLAYMORE_ANIM, type ThrowAnim } from '@s2u/scene';
import type { ActionPrompt, CompassMark } from './hud';
import type { MapAction } from './mapActions';
import { isHoldClip, type HoldPass, type Stance } from './mover';
import { BOMB_STATE, canDrop, HOLD_TICKS, holdKind, plantAimAt, plantReachFrom, plantSite, type BombWire, type PlantPick } from './net/objective';
import { TICK_HZ, type ServerEvent, type Team } from './net/protocol';
import { bombPulses, type BombCueKind, type BombPulses } from './roundCues';
import type { WorldState } from './worldState';

/**
 * XR-05 (socomlegacy/docs/research/214-demolition-as-built.md s1-s2): DEMOLITION's bomb on the page -- the follower half.
 * The room owns the bomb (`match/src/bomb.ts`); the page takes its state from the welcome's `objective` and every
 * `bomb` event (`NetClient.on` forwards both), predicts its own player's 5 s hold from the Action-held commands it
 * sends (`tick`, the room's rule: `./net/objective` `holdKind`; PAR-34: on the room's ticks), and answers the HUD: the prompt, the hold's progress,
 * the defuse timer. Headless: the page's drawers come injected (`BombPageView`), and `main.ts` constructs it (the wiring
 * is the controller's, PF.R22).
 *
 * XR-06 (research 214 s3-s4): the drawing half, through what `main.ts` lends at construction -- so `netPage.ts` needs
 * nothing:
 * - **the phase gate**: the prediction (`tick`, `holdProgress`) and the prompt only while the round is in play -- from a
 *   `roundStart` (or a welcome into a round begun: its `startTick`, no `waiting`, no `countdown`) until an `eliminated`,
 *   a `roundOver`, an `abandoned` or the bomb's own result (state 4 or 5): the room counts no hold in a decided round;
 * - **the cues** (`RoundAudioHost.bomb`): on a live state change the script's sequence by the bomb's side and the local
 *   team (`./roundCues` `BombCues`), its lines to the HUD's message window; a joiner's welcome plays none;
 * - **the satchel** (`./bodyView` `HIDDEN_AT_SPAWN`): shown on the carrier's body, off again on a drop or a plant
 *   (`FUN_005bbf10` -> `FUN_0059df60(owner, 1)`; `FUN_0059dd30`, `FUN_0059ddb0`; `FUN_005bc730`, `FUN_005bc200`) -- the
 *   others' through `RemotePlayers`, and (PB-1) the page's own through `ownBody`;
 * - **the plant's and the manual drop's clip** (PB-1, `PLANT_ANIM`): `Place claymore` on the own body when the room's
 *   placement begins for this page's id, or when the room drops the bomb this page carried for its own drop (`dropWhy`
 *   'manual', `DROP_WHY_MANUAL`); the
 *   others see it on the body's hold code;
 * - **the pickup's sound** (PB-1, `PICKUP_SOUND`): `.FOOTBOMB` at the carrier; the plant has none of its own
 *   (`PLANT_SOUND_READING`);
 * - **the world bomb** (`BOMB_MODEL_READING`) at `pos` on the ground (1), planted (3) and defused (4), never carried (2)
 *   nor after the blast (5: `FUN_002c1c30` hides its node);
 * - **`base_explosion1`** at the bomb on a live 3 -> 5 (`FUN_002c1c30` D:L163920: context type 3, the bomb's node);
 * - **the HUD** (`hudFrame`, once a frame): the compass's `ret_bomb` / `ret_base` (`COMPASS_BASE_MARK_READING`), the
 *   fuse in the round timer's place (`./hud` `DEFUSE_TIMER_LAYOUT_READING`) and (PB-8) the hold bar while this page's
 *   player holds the plant or the defuse (`holdBar`: `HOLD_BAR_DIRECTION_READING`, `HOLD_BAR_PLACEMENT_READING`).
 *   The prompt goes through the action context (`./actionContext` `contextPrompt`: `prompt()` feeds its `bombPlant`,
 *   `bombDefuse` and `bombDrop`), one prompt slot for every context.
 * - **the bases' pulse** (PB-9b, research 284 s3, s8; ruling PB2.R5): on a live change into carried, the carrier's
 *   target outline lit and pulsing -- the program the map's `objectives` calls for the carrier's side (`bomb_owner`),
 *   run on the page's world (`worldPulse`); on the ground, both stopped (`bomb_drop`), their cleanup putting the outline
 *   out. A plant, a defuse and a detonation leave it; the round's reset hides it (`WorldState.reset`). Every page draws
 *   it, whatever its team: no branch of the script tests `player_team` (research 284 s3).
 */

/**
 * DEFUSE_PROMPT_ICON_READING: the prompt beside a planted bomb the player may defuse. LkPaioX5 part 2 (b) (research 87
 * §5, "The action list"; reading, pending review): read -- the plant and the defuse are one record, action 7 (bit 0x80,
 * `FUN_0021f850` D:L74109-74116), and `FUN_002209c0` gives it a map action's icon only while the world bomb's node
 * (`DAT_0044d4a0`) is clear (the plant, D:L74560-74584); with the node set (the defuse) it keeps the record's own
 * (D:L74585-74586), `action_MP_bomb.tif` (`FUN_0021ded0` D:L73664) -- so `bomb_defuse`, `ACTION_ICONS`'
 * `action_mp_bomb.tif`, its caption HudCLOC's BOMB DEFUSAL (`ACTION_BOMB_CAPTION_IDS`). (Was: the generic
 * `action_x.tif`, `'action'`, unread.) The deviation: D:L74586 writes the record's icon word to itself, so once this
 * console has planted, every later defuse keeps the site's icon the plant wrote -- until `FUN_0021ded0` sets the records
 * up again (the HUD's init, D:L57421), not only for the round; the port always draws `bomb_defuse`. Not ported. What
 * makes it proven: capture B item 8 (a defuse by a console that planted before it).
 */
export const DEFUSE_PROMPT_ICON_READING: ActionPrompt = 'bomb_defuse';

/**
 * HOLD_BAR_DIRECTION_READING (PB-8, research 214 s3 and s6): which way the hold bar runs. `FUN_00220350` draws the fill
 * over the hold timer's seconds left (the kit's +0x160, clamped at 0) when `DAT_0044d4a0` is set, and over 5 less them
 * when it is 0 (D:L74430-74436). `DAT_0044d4a0` is the world bomb's node, "MPFootBomb": `FUN_0059dab0` sets it where it
 * makes the Satchel on the ground or planted (D:L457506-457509, D:L457536; from the state-1 and state-3 handlers,
 * `FUN_002c1c30` D:L163940-163963, `FUN_005bc200` D:L473724), the pickup clears it (`FUN_005bbf10` D:L473669). So the
 * plant's bar (the carrier holds the bomb: no node) fills, and the defuse's (its target the planted node,
 * `FUN_005920c0` D:L451500, +0x158 set from `DAT_0044d4a0` at D:L452587) empties. A reading of the code, pending
 * review; capture B items 7 and 8 (the plant's and the defuse's frames) settle it.
 */
export const HOLD_BAR_DIRECTION_READING = { plant: 'fills', defuse: 'empties' } as const;

/**
 * HOLD_BAR_PLACEMENT_READING (PB-8, research 214 s3 and s6): the bar ends at the plant's commit and does not show
 * through the 2.25 s placement. The commit clears the hold flag, +0x171 bit 5 (`FUN_005920c0` D:L451509-451516), so the
 * bar fades out over a quarter second (`./hud` `HOLD_BAR_FADE`); the flag cannot be set again in the placement, the
 * plant's eligibility needing the kit's +0x81c at or under 0 (`FUN_00594480` D:L452769), which the placement's start
 * sets to `DAT_00650678`, 3.0 off the ELF (`FUN_005be9a0` D:L475488, through `FUN_005c0020` D:L475994 from the commit's
 * D:L451514). The page ends its bar at the 300th held tick, its commit. The defuse's commit clears only the target
 * (D:L451519-451524), leaving the flag: its box stays empty for 1.0 s (+0x238, D:L451520-451522), then a still-held defuse restarts
 * (D:L452578-452587, D:L453267-453270); here the empty box lasts until the room's state 4, the same under normal latency. A
 * reading of the code, pending review; capture B item 7 (the plant's frames) settles it.
 */
export const HOLD_BAR_PLACEMENT_READING = 'ends-at-commit' as const;

/**
 * PLANT_AIM_RESEND_ADAPTATION (PLANT-AIM, the review's F3; a network adaptation, no game value): while the plant's pick
 * stays on the same node, the page names it again only once it has moved `move` units and `ticks` room ticks have passed
 * since the last -- at most 10 a second, under the room's text bank (match `server.ts`, 40 a second). The room does not
 * need the point to follow the look: it re-picks along its own look each tick (`room.ts` `plantAimSees`); the point
 * serves its second line, from the page's eye.
 */
export const PLANT_AIM_RESEND_ADAPTATION = { move: 4, ticks: 6 } as const;

/**
 * BOMB_MODEL_READING: the world bomb's model. Item 154's (MPBOMB, 0x9a) `zweapon.rdr` record has no `ModelName` (the
 * arsenal reads null on the MP72 fixture's ZWEAPON.ZAR); the bomb on the ground is made by `FUN_0059dab0` (from
 * `FUN_002c1c30` D:L163956-163964 with no carrier, and from `FUN_0059ddb0` D:L457601 after a drop), which asks the model
 * libraries for "Satchel" (`FUN_0031fd10(0x65f0f8)`, D:L457499; a case-blind name walk, research 188 s1.1), makes it at
 * the bomb's point with no turn (`FUN_00307360(0,0,0)`, `FUN_00317d90`, D:L457497-457500) and names the node
 * "MPFootBomb" (`FUN_00314ee0(.., 0x65f100)`, D:L457506). The library that holds a `Satchel` is the fittings'
 * (`FLIB_MDL.ZED`, the carrier's gear of the same name; the weapons' holds none) -- MP72's stands on its origin, 4.114
 * high. A reading of the code and the disc, pending review; the look on the ground settles with capture B items 5 and 11.
 */
export const BOMB_MODEL_READING = { item: 154, model: 'Satchel', node: 'MPFootBomb' } as const;

/**
 * COMPASS_BASE_MARK_READING: who sees the objective's compass marks. `ret_base` marks the tent the carrier's side must
 * reach (`plantSite`) for the players of that side while their side carries the bomb; `ret_bomb` marks the bomb for
 * everyone where it lies (states 1 and 3). The carried bomb is marked on nobody's compass (OT.R99, as amended
 * 2026-11-02 to match the original; reading, pending review, research 214 s3 "The compass while carried"): the pickup
 * frees the viewer's `BOMB_GROUND` mark (`FUN_005bbf10` D:L473680-473685) and makes only `ALL_YOUR_BASE`
 * (D:L473693-473701); the one type-1 (`ret_bomb`) maker is the ground's (`FUN_0059dab0` D:L457516-457526). Still open
 * (research 214 s3's findings): the other side's type-3 base mark (D:L473696-473699, not drawn here) and the planted
 * bomb's mark (none in the original, D:L457516). Settles: capture B (an enemy's compass while carried; one planted).
 */
export const COMPASS_BASE_MARK_READING = 'carrier-side' as const;

/**
 * PB-1 (research 214 s3): the plant's clip. The plant's commit runs `FUN_005be9a0`'s MPBOMB branch (the item's type byte
 * -0x66 = 0x9a), which pushes `FUN_0057d540(actor, DAT_003deb48, 0)` (D:L475480-475481) -- `DAT_003deb48` is the action
 * type `Place claymore` (`FUN_005e4f90(0x661628)`, D:L495216; the string at 0x661628), the claymore's and the PMN's
 * placing (D:L475322, D:L475354), not C4's `Put on wall` (D:L475420). With the sidearm in the hand the body plays its
 * pistol pair, `Pistol place claymore` (`FUN_0058c820`, the pairs `FUN_005e1cf0` D:L494772 registers; `handAnim`). The
 * Seal anim set names its clip `seal_place_claymore` (`test/equipmentAnim.test.ts` reads it off `animset.rdr`).
 */
export const PLANT_ANIM: ThrowAnim = PLACE_CLAYMORE_ANIM;

/**
 * PAR-74 (research 251 section 12.5, "PAR-74"): the plant's clip is pushed before the frame's driver -- the plant's hold
 * timer (`+0x160`) runs out in the player controller's tick (`FUN_00594cf0` D:L453273 -> `FUN_005920c0` D:L451514 ->
 * `FUN_005c0020(..., 0x9a)` -> `FUN_005be9a0` -0x66, D:L475481), `entity_pre_tick` -- so its hold runs on the push's own
 * clock (`./mover` `holdPassOf`), where the claymore's and the PMN's (the same code) lag. Read.
 */
export const PLANT_PUSH_PASS: HoldPass = 'before';

/**
 * BOMB_DROP_PUSH_PASS_READING (PAR-74, research 251 section 12.5, "PAR-74"): the pass of the manual drop's clip push. The
 * dropper's Action (`FUN_00592d50` D:L452153 -> `FUN_0059dd30` D:L457567 -> `FUN_002b9910`) reaches the bomb's state
 * directly on the host (D:L159496 -> `FUN_002c1f10` -> `FUN_002c20c0` D:L164040 -> `FUN_002c1c30` D:L163962 ->
 * `FUN_0059ddb0` D:L457611), all in the controller's tick (`entity_pre_tick`): before the driver -- read for a host
 * dropper. A peer's drop goes to the host as a message (D:L159489) and comes back through the shared state's callback
 * (`FUN_002c23b0` D:L164158, registered by `FUN_0030ce80` D:L164261), whose pass in the frame is not read. The page
 * plays the drop's clip on this pass since the online-parity sweep's P25 (the room names the manual drop,
 * `BombWire.dropWhy`; `dropped`); the room's mover does not derive it yet -- `room.ts` `placingPass` answers the plant's
 * clip alone, so the room lays the drop's hold on the code's default, after the driver (LATER 659). Settles: the network
 * library's dispatch of the shared state's callbacks against the scheduler's tasks (`FUN_001ec480` D:L50920-50934), or a
 * capture of a peer's drop.
 */
export const BOMB_DROP_PUSH_PASS_READING: HoldPass = 'before';

/**
 * PLANT_SOUND_READING (PB-1, research 214 s6): the plant makes no sound of its own; its sound is the map's `objectives`
 * script's `switch_timer` on `mp_bomb == 3` (`RoundCues.bomb`'s `planted`, s3). Read: item 154 (MPBOMB) names no
 * `FireAnimName` (`zweapon.rdr`: `NOT FOUND`; the claymore's and C4's are `c4_start`, `.PLACE_CHARGE`); the `Place claymore`
 * clips carry no `zanim_callback` (`motion.rdr`); and the placement's end, `FUN_005bc730`, on a network game
 * (`DAT_0045a0c1`, research 107) hides the satchel and sends state 3 for the bomb and returns (D:L473973-473984) before the
 * item's `FireAnim` is looked up and played (`FUN_003d22b0`, `FUN_00272bb0`, D:L474051-474059). No sequence of the script
 * waits on the placement (`mp_bomb` stays 2). A reading of the code and the disc, reviewed 2026-10-09; capture B item 7 (the
 * plant's frames, with their audio) settles it.
 */
export const PLANT_SOUND_READING = 'script-only' as const;

/**
 * PB-1 (research 214 s3): the pickup's sound. `FUN_005bbf10`, run on every machine by the state-2 handler
 * (`FUN_002c1c30` D:L163953), finds the world bomb (`FUN_00541c60`: the item of type 0xb) and plays the sound named
 * `.FOOTBOMB` (the string at 0x65f860; `FUN_00344f30`, research 122 R122.1) at the carrier's place (`actor + 0x1c`) at 1.0
 * (D:L473662-473664). `.FOOTBOMB` is in the walk banks (`golden/walk-sounds.json`: group 2, range 100-600).
 */
export const PICKUP_SOUND = '.FOOTBOMB';

/**
 * PB-1 re-review (option B): the wire's reason for a drop the carrier made himself (`BombWire.dropWhy`, set by the room's
 * `BombAuthority.manualDrop` since P25; 'death', 'leave' and 'gone' the others) -- the only drop whose clip the dropper
 * plays.
 */
export const DROP_WHY_MANUAL = 'manual';

/**
 * BASE_PULSE_JOIN_READING (PB-9b; research 284 s7): a page that joins while the bomb is carried lights the carrier's
 * target outline at its welcome, as a pickup would -- the joiner's `objectives` starts with the round, finds `mp_bomb ==
 * 2` and `bomb_owner` set (`FUN_002c23b0` D:L164156-164158 replicates the state) and calls the pulse; a welcome into
 * any other state lights none (the script waits for 2, and a plant comes after it) [reading: the join's replay of the
 * bomb's state before the script's first tick is not traced; settles: a joiner's first frames on a live round, or a
 * capture].
 */
export const BASE_PULSE_JOIN_READING = 'welcome-carried' as const;

/** PB-9b: the bases' pulse, as the page's world runs it (`worldPulse`). */
export interface BombPulseView {
  /** `bomb_pickup`'s calls for the carrier's side (`bomb_owner`): the target's outline lit and pulsing. */
  pickup(side: Team): void;
  /** `bomb_drop`'s stops: both outlines out. */
  drop(): void;
}

/**
 * PB-9b: the pulse on a page's world (both pages lend theirs): the names read off the map's own `objectives`
 * (`./roundCues` `bombPulses`, once a world), run for the drawing alone (`WorldState.runDisplay`) and stopped
 * (`WorldState.stopProgram`). A world with no `objectives` (a map with no bomb, or none yet) does nothing.
 */
export function worldPulse(world: () => WorldState | null): BombPulseView {
  const read = new WeakMap<WorldState, BombPulses | null>();
  const pulses = (w: WorldState): BombPulses | null => {
    if (!read.has(w)) { const o = w.program('objectives'); read.set(w, (o && bombPulses(o.program)) ?? null); }
    return read.get(w) ?? null;
  };
  return {
    pickup: (side) => { const w = world(); if (w) for (const name of pulses(w)?.pickup[side] ?? []) w.runDisplay(name); },
    drop: () => { const w = world(); if (w) for (const name of pulses(w)?.drop ?? []) w.stopProgram(name); },
  };
}

/** What the page lends the bomb. */
export interface BombPageDeps {
  /** The page's own seat (`NetClient`'s id and team), null before a welcome or for a spectator. */
  id(): number | null;
  team(): Team | null;
  alive(): boolean;
  /** The walk's feet, null when not walking. */
  feet(): readonly number[] | null;
  /** The map's actions (`LoadedMap.meta.actions`): the two MPBOMB records. */
  actions(): readonly MapAction[];
  /** The last command's stick and the look's pitch (degrees, up positive): the manual drop's gate. */
  look(): { forward: number; right: number; pitch: number } | null;
  /** The room's tick as the page reckons it now (`NetClient.serverTick`). */
  serverTick(): number;
  /** XR-06: a player's side (`RemotePlayers.teamOf`, the page's own for its id); null when unknown. */
  teamOf?(id: number): Team | null;
  /** XR-06: a player's body's feet (`RemotePlayers.feet`): where the pickup's sound plays; null when not drawn. */
  bodyAt?(id: number): readonly number[] | null;
  /**
   * PB-1 (review F2): whether the followed room's socket is open (`NetClient.state`); read once a frame (`hudFrame`). A
   * room lost with no new welcome takes the own body's satchel off -- a browser adaptation: the original's console has
   * no lost room to draw.
   */
  open?(): boolean;
  /**
   * LATER 220's second head (research 369 §2): the action prompts' common gate shut on the command just sent
   * (`./walk` `WalkMode.actionGateShut`): no hold predicted under it. Absent: open.
   */
  gateShut?(): boolean;
  /**
   * PLANT-AIM (`./net/objective` `PLANT_REACH_READING`): the action button's pick now -- the surface the use prompt's ray
   * strikes (`./equipment` `actionRayPick` along `WalkMode.lookAim`) and the eye it left -- or null. Absent: none, so no
   * disc tent's plant (a forge site's reach needs none).
   */
  pick?(): (PlantPick & { point: [number, number, number]; eye?: [number, number, number] }) | null;
  /**
   * PLANT-AIM: the body's facing (degrees, the last command's yaw) and stance (`WalkMode.posture`): the plant's reach point
   * (`plantReachFrom`, `PLANT_PICK_FIREPOINT_READING`). Absent: the reach from the feet.
   */
  body?(): { yaw: number; posture: Stance } | null;
  /**
   * PLANT-AIM: name the plant's pick to the room (`bombAction` 'aim'), or none (null): called when it changes, while the
   * page carries the bomb (`BombPage.tick`).
   */
  aim?(claim: { surface: { path: string; point: [number, number, number] }; eye?: [number, number, number] } | null): void;
}

/** XR-06: the HUD's part the bomb draws through (`./hud` `Hud`). */
export interface BombHud {
  setExtraMarks(marks: readonly CompassMark[]): void;
  setDefuseTimer(seconds: number | null): void;
  /** PB-8: the hold bar's fill, 0..1 of its width, or null with no hold (`./hud` `Hud.setHoldBar`). */
  setHoldBar(fill: number | null): void;
  postMessage(text: string, scale: number): void;
}

/** XR-06: the page's drawers, lent at construction (`main.ts`); each absent one is not drawn. */
export interface BombPageView {
  /** The round's audio (`./roundAudioHost` `RoundAudioHost.bomb`). */
  roundAudio?: { bomb(kind: BombCueKind, owner: Team, team: Team | null, post?: (text: string, scale: number) => void): void } | null;
  hud?: BombHud | null;
  /** The others' bodies (`./remotePlayers` `RemotePlayers.setGearVisible`): the satchel. */
  remotePlayers?: { setGearVisible(id: number, name: string, on: boolean): void } | null;
  /** The effects (`./effects` `Effects.play`): `base_explosion1`. */
  effects?: { play(name: string, place: { node?: Matrix4; position?: [number, number, number] | null; normal?: [number, number, number] | null }): boolean } | null;
  /** The world bomb's model (`./grenade` `Grenade.worldBomb`): placed at a point, or taken away (null). */
  worldBomb?: { place(pos: readonly [number, number, number] | null): void } | null;
  /**
   * PB-1: the page's own body -- its gear (`./play` `Play.setGearVisible`: the satchel), the plant's clip (`startClip`:
   * the throw's pose layer and the mover's hold, as C4's and the claymore's placing start them, `./matchThrow`'s
   * `throwStart`; `hold` a `HOLD_CLIPS` name, the command's and the body's hold code) and the sidearm in the hand
   * (`pistol`: `+0xf79` 2).
   */
  ownBody?: {
    setGearVisible(name: string, on: boolean): unknown;
    startClip?(anim: ThrowAnim, hold: string, pass?: HoldPass): void;
    pistol?(): boolean;
  } | null;
  /** PB-1: the game's sounds at a place (`./audio` `GameAudio.play`): the pickup's `.FOOTBOMB`. */
  sound?: { play(name: string, at: readonly [number, number, number]): void } | null;
  /** PB-9b: the bases' pulse on the page's world (`worldPulse`). */
  pulse?: BombPulseView | null;
}

/**
 * PB-1: the own body as both pages lend it (`./main`, `./matchMount`): the gear through `./play` `Play.setGearVisible`,
 * the plant's clip on the throw's pose layer (`./throwPose` `ThrowPose.start`) with the mover's hold (`./walk`
 * `WalkMode.hold`) -- as `./matchThrow` starts the claymore's own placing on `throwStart` -- and the sidearm in the hand.
 * NU-8b B3 (research 326 section 3; reading, pending review): the plant's `Place claymore` is the stack's top as the
 * claymore's placing is, so the hold goes first and the clip is started as the one it carries (`held`): an earlier
 * hold the new one replaces ends on the earlier clip, and the plant's pops at its own hold's end (`throwPoseEnds`; the
 * bomb's 156th command, PAR-74). *Was*: the clip first, carried by no hold, out on its own clock from its last key.
 */
export function ownBombBody(
  play: { setGearVisible(name: string, on: boolean): unknown },
  pose: { start(anim: ThrowAnim, held?: boolean): unknown },
  walk: { hold(clip: string, period?: number, pass?: HoldPass): boolean },
  pistol: () => boolean,
): NonNullable<BombPageView['ownBody']> {
  return {
    setGearVisible: (name, on) => play.setGearVisible(name, on),
    startClip: (anim, hold, pass) => { const held = walk.hold(hold, undefined, pass); pose.start(anim, held); },   // PAR-74: the push's pass
    pistol,
  };
}

/** PB-1: the bomb's sounds on a page's game audio (`./audio` `GameAudio.play`), at the place, at 1.0 (D:L473664). */
export function bombSound(
  audio: { play(name: string, at: readonly [number, number, number] | null, event: 'play', volume: number): unknown },
): NonNullable<BombPageView['sound']> {
  return { play: (name, at) => { audio.play(name, at, 'play', 1); } };
}

/** The gear the carrier wears (`./bodyView` `HIDDEN_AT_SPAWN`; the string at 0x65f0f8). */
const SATCHEL = 'Satchel';
/** The effect the detonation plays at the bomb (`FUN_002c1c30` D:L163920). */
const BLAST_EFFECT = 'base_explosion1';

/** Where the room's events come from (`NetClient.on`). */
export interface BombEvents { on(listener: (ev: ServerEvent) => void): () => void }

export class BombPage {
  private bomb: BombWire | null = null;
  /**
   * The page's own hold: the room's ticks it has run (PAR-34: counted from `since`, the room's tick as the page reckoned
   * it at the first held command, never back), and what for.
   */
  private held = 0;
  private heldKind: 'plant' | 'defuse' | null = null;
  private since = 0;
  private readonly off: () => void;
  /** XR-06: the bomb live -- the round in play or in its decided hold (LATER 145; the phase gate). */
  private playing = false;
  /**
   * LATER 145 (the review's F1) / 150: what decided the round, the first of them -- 'timeout' a `timedOut`; 'other' an
   * `eliminated`; a welcome in `decided`, by its `decided.reason` (LATER 155; an older room names none: 'other'); null in play. After 'other' the
   * plant's cue plays nothing (`switch_timer`, stopped by `start`'s every elimination branch); after 'timeout' the round
   * audio decides by the map's cues (`DecidedCues.timeoutPlantLive`: MP61's and MP62's time-out leave it running, MP73's
   * does not). A page that joins or reconnects in the hold knows it here, its round audio too (LATER 155, `markDecided`). Cleared at a `roundStart`.
   */
  private decidedRound: 'timeout' | 'other' | null = null;
  /** XR-06: whose body wears the satchel now, or null. */
  private satchelOn: number | null = null;
  /** PB-1: whether the page's own body wears it. */
  private ownSatchel = false;
  /** PB-1: the placement whose clip the own body has played (its hold's `sinceTick`), or null. */
  private plantClip: number | null = null;
  /** PLANT-AIM: the pick last named to the room (`aimed`) and the room tick it was named on; null for none. */
  private aimSent: { path: string; point: readonly number[]; tick: number } | null = null;

  constructor(events: BombEvents, private readonly deps: BombPageDeps, private readonly view: BombPageView = {}) {
    this.off = events.on((ev) => this.event(ev));
  }

  /** XR-06: whether the bomb is live -- the round in play or its decided hold (LATER 145; the gate of `tick`, `holdProgress` and `prompt`). */
  inPlay(): boolean { return this.playing; }

  /** Stop following (the page leaves the match); the own body's satchel taken off (review F2). */
  dispose(): void {
    this.off();
    this.ownSatchelOff();
  }

  /** The bomb as the room last told it, or null (no bomb on this map, or before a welcome). */
  state(): BombWire | null {
    return this.bomb && { ...this.bomb, pos: [...this.bomb.pos] };
  }

  /**
   * One command of the page's own (60 Hz), `actionHeld` its `Button.ActionHeld` bit: the hold begun or kept while
   * eligible, back to 0 on a command without it, out of reach, or under the prompts' common gate (`FUN_00594cf0`'s hold, D:L453249-453287; *was*
   * cited `FUN_00594600`), as the room's `command` does.
   *
   * PAR-34 (research 252 s3; ACT.R8): the hold's progress is the room's ticks, not the page's commands -- the room
   * advances a hold one a tick while it is live (`match/src/bomb.ts` `step`), and a page below 10 fps sends fewer than
   * 60 commands a second (one a 1/60 tick of its clamped step), so counting them ran the bar at half the room's rate at
   * 5 fps, and a flood would have hurried it. The page counts the room's tick as it reckons it (`serverTick`) from the
   * first held command's: one tick at that command, as the room's first `step` counts it. Not modelled: the room's pause
   * of a hold whose commands stop for `HOLD_LIVE_TICKS_PLACEHOLDER` ticks: below about 4 fps (frames over 0.25 s) the room
   * pauses the hold for part of each frame, so this bar runs ahead of its commit (at 3 fps, 5 s against about 6.7 s) and a
   * player who lets go when it ends plants nothing -- the review's F-a.
   */
  tick(actionHeld: boolean): void {
    const pick = this.carrying() ? this.deps.pick?.() ?? null : null;
    this.aimed(pick);
    // LATER 220's second head, its review's F1: the bar needs the bomb's prompt heading the list (research 214, flag bit 4,
    // D:L74302-74307, D:L74429), built past the prompts' common gate (research 369 §2): under it, no hold, as the room's.
    const kind = actionHeld && this.playing && this.deps.alive() && !(this.deps.gateShut?.() ?? false) ? this.eligible(pick) : null;
    if (!kind) { this.held = 0; this.heldKind = null; return; }
    if (kind !== this.heldKind) { this.held = 0; this.heldKind = kind; this.since = this.deps.serverTick(); }
    this.count();
  }

  /** PAR-34: the hold's ticks now -- the room's ticks since `since`, its first counted, at most `HOLD_TICKS`, never back. */
  private count(): number {
    if (!this.heldKind) return 0;
    const ticks = Math.floor(this.deps.serverTick() - this.since + 1e-9) + 1;
    this.held = Math.min(HOLD_TICKS, Math.max(this.held, ticks));
    return this.held;
  }

  /** The predicted hold's progress, 0..1 of the 5 s (`HOLD_TICKS`), or null with none (PB-8 draws it: `holdBar`). */
  holdProgress(): number | null {
    return this.heldKind && this.count() > 0 ? this.held / HOLD_TICKS : null;
  }

  /**
   * PB-8: the hold bar's fill now, 0..1, or null for none: the plant's grows with the hold, the defuse's shrinks
   * (`HOLD_BAR_DIRECTION_READING`); the plant's ends at its commit (`HOLD_BAR_PLACEMENT_READING`). The share is the
   * room's ticks the hold has run as the page reckons them (`tick`, PAR-34), where the original's timer takes the frame's
   * dt (`FUN_005920c0` D:L451498-451505): real time either way, at any frame rate (ACT.R8).
   */
  holdBar(): number | null {
    const progress = this.holdProgress();
    if (progress === null) return null;
    if (this.heldKind === 'plant') return this.held >= HOLD_TICKS ? null : progress;
    return 1 - progress;
  }

  /**
   * The context prompt the bomb asks (research 87 s5, `ACTION_ICONS`): `bomb` (`action_mp_bomb.tif`) for the carrier at
   * its side's site; `bomb_drop` (`action_drop_mp_bomb.tif`) when the manual drop's gate is open (`canDrop`); the defuse's
   * (`DEFUSE_PROMPT_ICON_READING`) beside a planted bomb of the other side; else null.
   */
  prompt(): ActionPrompt | null {
    const b = this.bomb, id = this.deps.id();
    if (!b || id === null || !this.playing || !this.deps.alive()) return null;
    const kind = this.eligible();
    if (kind === 'plant') return 'bomb';
    if (kind === 'defuse') return DEFUSE_PROMPT_ICON_READING;
    const look = this.deps.look();
    const carrying = b.state === BOMB_STATE.carried && b.carrier === id && b.hold?.kind !== 'place';
    if (look && canDrop({ carrying, tick: this.deps.serverTick(), pickupAfterTick: b.pickupAfterTick, ...look })) return 'bomb_drop';
    return null;
  }

  /** Seconds left on the fuse ("MP DEFUSE BOMB"), from the room's `detonateTick` against its tick now; null unless planted. */
  defuseTimer(): number | null {
    const b = this.bomb;
    if (!b || b.state !== BOMB_STATE.planted || b.detonateTick === null) return null;
    return Math.max(0, (b.detonateTick - this.deps.serverTick()) / TICK_HZ);
  }

  /**
   * XR-06: the HUD's frame (`main.ts`, `matchMount.ts`, once a frame): the compass's marks
   * (`COMPASS_BASE_MARK_READING`), the fuse in the round timer's place and (PB-8) the hold bar; nothing while the round
   * is not in play. `hud`: the one lent at construction unless given.
   */
  hudFrame(hud: BombHud | null = this.view.hud ?? null): void {
    if (this.deps.open?.() === false) this.ownSatchelOff();     // review F2: no room, no satchel on the own body
    if (!hud) return;
    hud.setExtraMarks(this.playing ? this.marks() : []);
    hud.setDefuseTimer(this.playing ? this.defuseTimer() : null);
    hud.setHoldBar(this.playing ? this.holdBar() : null);
  }

  /** The compass's objective marks now. */
  private marks(): CompassMark[] {
    const b = this.bomb, team = this.deps.team();
    if (!b) return [];
    const out: CompassMark[] = [];
    // OT.R99: no ret_bomb while carried, for any viewer (FUN_005bbf10 D:L473680-473685 frees BOMB_GROUND at the pickup).
    if (b.state === BOMB_STATE.ground || b.state === BOMB_STATE.planted) out.push({ bitmap: 'ret_bomb.tif', x: b.pos[0]!, z: b.pos[2]! });
    if (b.state === BOMB_STATE.carried && b.carrier !== null && team && this.teamOf(b.carrier) === team) {
      const site = plantSite(team, this.deps.actions());
      if (site) out.push({ bitmap: 'ret_base.tif', x: site.at[0], z: site.at[2] });
    }
    return out;
  }

  private teamOf(id: number): Team | null {
    return id === this.deps.id() ? this.deps.team() : this.deps.teamOf?.(id) ?? null;
  }

  /**
   * The hold this page's player may count now (`holdKind`, the room's rule). PLANT-AIM: the plant on the action button's
   * pick (`pick`, the deps' when not given), as the room judges the one the page names (`aimed`).
   */
  private eligible(pick: ReturnType<NonNullable<BombPageDeps['pick']>> | undefined = undefined): 'plant' | 'defuse' | null {
    const b = this.bomb, id = this.deps.id(), team = this.deps.team(), feet = this.deps.feet();
    if (!b || id === null || !team || !feet) return null;
    const state = { state: b.state, carrier: b.carrier, placing: b.hold?.kind === 'place', plantingTeam: b.plantingTeam, pos: b.pos };
    const p = pick !== undefined ? pick : this.carrying() ? this.deps.pick?.() ?? null : null;
    const actions = this.deps.actions();
    return holdKind(state, { id, team, feet, pick: p, from: this.reachFrom(feet) }, plantSite(team, actions), actions);
  }

  /** PLANT-AIM: the plant's reach point (`plantReachFrom`) from the body the page lends, else the feet. */
  private reachFrom(feet: readonly number[]): readonly number[] {
    const b = this.deps.body?.();
    return b ? plantReachFrom(feet, b.yaw, b.posture) : feet;
  }

  /** PLANT-AIM: this page's player carries the bomb with no placement running (the plant's pick is read only then). */
  private carrying(): boolean {
    const b = this.bomb, id = this.deps.id();
    return !!b && id !== null && b.state === BOMB_STATE.carried && b.carrier === id && b.hold?.kind !== 'place';
  }

  /**
   * PLANT-AIM (`PLANT_REACH_READING`): the room is told the plant's pick -- the pick while it offers this side's site in
   * play (`plantAimAt`), else none -- so the room, which sees no reticle, knows the node to re-pick each tick along its
   * own look (`match/src/room.ts` `plantAimSees`). Named before the press, so the hold's first command finds it; named
   * again at once when the struck node changes (none included), and otherwise only past `PLANT_AIM_RESEND_ADAPTATION`
   * (the review's F3: one a frame overran the room's text bank).
   */
  private aimed(pick: ReturnType<NonNullable<BombPageDeps['pick']>>): void {
    const id = this.deps.id(), team = this.deps.team(), feet = this.deps.feet();
    const actions = this.deps.actions(), site = team ? plantSite(team, actions) : null;
    const offered = pick && this.playing && id !== null && site && feet && plantAimAt(site, feet, pick, actions, this.reachFrom(feet)) ? pick : null;
    const was = this.aimSent, tick = this.deps.serverTick();
    if (!offered && !was) return;
    if (offered && was && offered.path === was.path) {
      const moved = Math.hypot(offered.point[0] - was.point[0]!, offered.point[1] - was.point[1]!, offered.point[2] - was.point[2]!);
      if (moved < PLANT_AIM_RESEND_ADAPTATION.move || tick - was.tick < PLANT_AIM_RESEND_ADAPTATION.ticks) return;
    }
    this.aimSent = offered ? { path: offered.path, point: [...offered.point], tick } : null;
    this.deps.aim?.(offered ? { surface: { path: offered.path, point: [offered.point[0], offered.point[1], offered.point[2]] }, ...(offered.eye ? { eye: offered.eye } : {}) } : null);
  }

  private event(ev: ServerEvent): void {
    const was = this.bomb;
    if (ev.type === 'welcome') {
      this.bomb = ev.objective ?? null;
      this.aimSent = null;                                              // PLANT-AIM: a new room holds no pick of this page's
      // ONL-18b (web research 221; XR-06's join reading retired): the room's own state, the welcome's
      // `phase` -- live in `play` and, since LATER 145 (`DECIDED_HOLD_BOMB_READING`), in a decided hold -- and not decided
      // by the bomb. From a server before `phase`: a round begun (`startTick`), not waiting for its sides nor counting
      // down to its launch.
      this.playing = (ev.phase !== undefined ? ev.phase === 'play' || ev.phase === 'decided' : ev.startTick !== undefined && !ev.waiting && ev.countdown === undefined) && !decided(this.bomb);
      // LATER 150 / 155: in a decided hold, the welcome's reason -- a time-out's, else 'other' (an older room names none: an
      // elimination's taken, as before).
      this.decidedRound = ev.phase === 'decided' ? (ev.decided?.reason === 'timeout' ? 'timeout' : 'other') : null;
      this.plantClip = this.ownPlacement(this.bomb);                     // a placement under way at a welcome: no clip
      this.draw(null, this.bomb);
      this.pulse(null, this.bomb);
    } else if (ev.type === 'bomb') {
      const { type: _type, ...wire } = ev;
      this.bomb = wire;
      this.draw(was, wire);
      this.pulse(was, wire);
      this.plant(wire);
      this.dropped(was, wire);
      if (this.playing && was) this.cue(was, wire);
      if (decided(wire)) this.playing = false;
    } else if (ev.type === 'roundStart') {
      this.playing = true;
      this.decidedRound = null;
    } else if (ev.type === 'score') {
      // The room's clock: null between rounds and in the expired and over phases (`Room.timeLeft`); a counting clock
      // changes nothing (the decided hold counts too: the welcome's `phase` told it).
      if (ev.timeLeft === null) this.playing = false;
      else return;
    } else if (ev.type === 'eliminated' || ev.type === 'timedOut') {
      this.decidedRound ??= ev.type === 'timedOut' ? 'timeout' : 'other';   // LATER 145: the bomb stays live; LATER 150: the reason
      return;
    } else if (ev.type === 'roundOver' || ev.type === 'abandoned') {
      // LATER 145: an `eliminated` or a `timedOut` decides the round, not the bomb -- it stays live through the hold.
      this.playing = false;
    } else return;
    if (!this.playing || !this.eligible()) { this.held = 0; this.heldKind = null; }
  }

  /** The satchel, the world bomb and the blast for a change from `was` (null: a welcome, drawn silently) to `now`. */
  private draw(was: BombWire | null, now: BombWire | null): void {
    const v = this.view;
    const carrier = now?.state === BOMB_STATE.carried ? now.carrier : null;
    if (carrier !== this.satchelOn) {
      if (this.satchelOn !== null) v.remotePlayers?.setGearVisible(this.satchelOn, SATCHEL, false);
      if (carrier !== null) v.remotePlayers?.setGearVisible(carrier, SATCHEL, true);
      this.satchelOn = carrier;
    }
    // PB-1: the page's own body by the same rule (`FUN_0059df60` is every actor's): on while this page's seat carries.
    const own = carrier !== null && carrier === this.deps.id();
    if (own !== this.ownSatchel) {
      v.ownBody?.setGearVisible(SATCHEL, own);
      this.ownSatchel = own;
    }
    // PB-1: the pickup's `.FOOTBOMB` at the carrier (`FUN_005bbf10` D:L473662-473664): a live change into carried only --
    // not a welcome, nor a takeover's rekey (carried to carried).
    if (was && was.state !== BOMB_STATE.carried && carrier !== null) {
      const at = carrier === this.deps.id() ? this.deps.feet() : this.deps.bodyAt?.(carrier);
      const p = at ?? now!.pos;
      v.sound?.play(PICKUP_SOUND, [p[0]!, p[1]!, p[2]!]);
    }
    if (was?.state === BOMB_STATE.planted && now?.state === BOMB_STATE.detonated) {
      // FUN_002c1c30 D:L163926 passes type 3: FIRE_WEAPON resolves NODE_CALLER, not a type-5 point.
      // Keep the point for the existing view contract; the command has no atContext flag, so it is not added twice.
      const position: [number, number, number] = [now.pos[0]!, now.pos[1]!, now.pos[2]!];
      v.effects?.play(BLAST_EFFECT, { node: new Matrix4().makeTranslation(...position), position, normal: [0, 1, 0] });
    }
    const lies = now && (now.state === BOMB_STATE.ground || now.state === BOMB_STATE.planted || now.state === BOMB_STATE.defused);
    v.worldBomb?.place(lies ? [now.pos[0]!, now.pos[1]!, now.pos[2]!] : null);
  }

  /**
   * PB-9b: the bases' pulse for a change from `was` (null: a welcome, BASE_PULSE_JOIN_READING) to `now`. Into carried
   * (`bomb_pickup` on `mp_bomb == 2`): the carrier's side's program -- a carried bomb's new carrier with no state change
   * (a takeover's rekey) is no pickup; a carrier whose side the page does not know lights nothing. On the ground
   * (`bomb_drop` on `mp_bomb == 1`): both stopped. A welcome first puts out what the page's world had lit: the joiner's
   * world opens with both outlines off.
   */
  private pulse(was: BombWire | null, now: BombWire | null): void {
    const v = this.view.pulse;
    if (!v) return;
    if (was === null) v.drop();
    if (now?.state === BOMB_STATE.ground) { v.drop(); return; }
    if (now?.state !== BOMB_STATE.carried || now.carrier === null || was?.state === BOMB_STATE.carried) return;
    const side = this.teamOf(now.carrier);
    if (side) v.pickup(side);
  }

  /**
   * PB-1: the plant's clip on the own body (`PLANT_ANIM`, its pistol pair with the sidearm in the hand), once a
   * placement, when the room's placement for this page's seat begins. ROOM-AUTHORITY TIMING (PF.R27; review F3; research
   * 214 s6's open question): the room is the bomb's authority, so three things the original's planter does locally at
   * its commit come a round trip later here -- this clip, the mover's hold it brings (`walk.hold`), and the own satchel's
   * hide at a drop or a plant (the original hides it locally and at once: the dropper right after sending the drop, in the
   * same call -- the send D:L457567, the hide D:L457568-457570 -- and the planter before its send, D:L473974 then
   * D:L473982). The mover's hold
   * rides the command and the body's hold code, so the room's mover and the others' bodies play it too.
   */
  private plant(now: BombWire): void {
    const since = this.ownPlacement(now);
    if (since === null || since === this.plantClip) return;
    this.plantClip = since;
    this.startOwnClip(PLANT_PUSH_PASS);
  }

  /**
   * PB-1 (review F1): the manual drop's clip. Every machine's state-1 handler `FUN_0059ddb0` pushes `Place claymore`
   * (`DAT_003deb48`) on the dropper only where its controller is not remote (vtable +0x34, `CRemoteCtrl::IsRemote`;
   * research 193 s12.6), D:L457606-457612 -- the dropper's own console; the others see it through the push's replication
   * (`FUN_00588bc0` D:L446408-446416 -> `FUN_002bbaf0` Push Blend, the type's `network_log` in `animset.rdr`). Played
   * when the room puts the bomb this page carried on the ground for its own drop -- the wire's `dropWhy` 'manual', which
   * the room sets in `BombAuthority.manualDrop` against `dropped` at a death or a leave (PB-1 re-review, option B; the
   * room's hunk landed by the online-parity sweep's P25) -- in play. A page's own ask cannot tell it: the room refuses a
   * drop with no bomb event (`Room.bombAction`), and its drop for a death comes before its `kill` (`Room.kill`), so an
   * unanswered ask would reach a death drop. Whether the original's push takes on a dead actor is
   * `DEATH_DROP_CLIP_READING` (none here). The same clip as the plant's, with its pistol pair.
   */
  private dropped(was: BombWire | null, now: BombWire): void {
    const id = this.deps.id();
    if (!this.playing || id === null || was?.state !== BOMB_STATE.carried || was.carrier !== id) return;
    if (now.state !== BOMB_STATE.ground || now.dropWhy !== DROP_WHY_MANUAL) return;
    this.startOwnClip(BOMB_DROP_PUSH_PASS_READING);
  }

  /**
   * The own body's `Place claymore` (`PLANT_ANIM`, its pistol pair with the sidearm in the hand) and the mover's hold, on
   * its push's pass (PAR-74: `PLANT_PUSH_PASS`, `BOMB_DROP_PUSH_PASS_READING`).
   */
  private startOwnClip(pass: HoldPass): void {
    const body = this.view.ownBody;
    if (!body?.startClip) return;
    const anim = handAnim(PLANT_ANIM, body.pistol?.() ?? false);
    body.startClip(anim, isHoldClip(anim.clip) ? anim.clip : PLANT_ANIM.clip, pass);
  }

  /** Review F2: the own body's satchel off, if it was on. */
  private ownSatchelOff(): void {
    if (!this.ownSatchel) return;
    this.view.ownBody?.setGearVisible(SATCHEL, false);
    this.ownSatchel = false;
  }

  /** The `sinceTick` of the room's placement for this page's seat, or null. */
  private ownPlacement(b: BombWire | null): number | null {
    const id = this.deps.id();
    return b?.hold?.kind === 'place' && id !== null && b.hold.by === id ? b.hold.sinceTick : null;
  }

  /** The script's cue for a live change (research 214 s3): by the bomb's side and the local team. */
  private cue(was: BombWire, now: BombWire): void {
    const audio = this.view.roundAudio;
    if (!audio || was.state === now.state) return;
    let kind: BombCueKind | null = null, owner: Team | null = null;
    // Entering mp_bomb == 2 only (`bomb_pickup`'s trigger): a carried bomb's new carrier without a state change is a session
    // takeover's rekey (`BombAuthority.rekey`), no pickup -- the satchel moves (`draw`), nothing plays.
    if (now.state === BOMB_STATE.carried && now.carrier !== null && was.state !== BOMB_STATE.carried) {
      kind = 'pickup';
      owner = this.teamOf(now.carrier);
    } else if (now.state === BOMB_STATE.ground && was.state === BOMB_STATE.carried) {
      kind = 'drop';
      owner = was.carrier !== null ? this.teamOf(was.carrier) : null;
    } else if (now.state === BOMB_STATE.planted && was.state !== BOMB_STATE.planted) {
      if (this.decidedRound === 'other') return; // LATER 145 (F1): `switch_timer` stopped by the deciding elimination (150: a time-out's, the cues')
      kind = 'planted';
      owner = now.plantingTeam;
    } else if (now.state === BOMB_STATE.defused && was.state === BOMB_STATE.planted) {
      kind = 'defused';
      owner = now.defuser !== null ? this.teamOf(now.defuser) : null;
      owner ??= now.plantingTeam === 'seal' ? 'terrorist' : now.plantingTeam === 'terrorist' ? 'seal' : null;
    } else if (now.state === BOMB_STATE.detonated && was.state === BOMB_STATE.planted) {
      kind = 'detonated';
      owner = now.plantingTeam;
    }
    // A side unknown (a carrier this page has not seated): the pickup's and the drop's cues are the same for both sides
    // on the disc (213 s2.4), so the SEALs' stand in; a result needs its side.
    if (kind && !owner && (kind === 'pickup' || kind === 'drop')) owner = 'seal';
    if (!kind || !owner) return;
    const hud = this.view.hud;
    audio.bomb(kind, owner, this.deps.team(), hud ? (text, scale) => hud.postMessage(text, scale) : undefined);
  }
}

/** The bomb decided the round: defused or detonated. */
function decided(b: BombWire | null): boolean {
  return b?.state === BOMB_STATE.defused || b?.state === BOMB_STATE.detonated;
}
