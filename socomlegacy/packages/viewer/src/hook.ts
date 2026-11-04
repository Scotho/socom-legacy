import type { CraneHookView } from './craneHook';
import type { CraneActionMiss } from './equipment';
import type { OnlineChoice, OnlineStatus } from './online';
import type { EffectStats } from './effects';
import type { Spawns } from '@s2u/scene';
import type { LoadPhase } from '@s2u/ui';
import type { Pose } from './camera';
import type { Input } from './gamepad';
import type { Backend } from './renderer';
import type { LinkRecord } from './linkLog';
import type { FireState, Shot } from './fire';
import type { Rect, ReticleColour } from './reticle';
import type { HudPatch, HudView } from './hud';
import type { AccuracyState, Cone } from './accuracy';
import type { StartMenuState } from './startMenu';
import type { NativeSettings } from './nativeSettings';
import type { PlayOptions } from './originalOptions';
import type { ZoomView } from './zoom';
import type { Stand } from './stand';
import type { BodyView } from './bodyView';
import type { SliderName, ToggleName } from './ui';
import type { MoverState, Stance, WalkCameraState } from './walk';
import type { AnimStats } from './animator';
import type { LookOptions, LookState } from './look';
import type { OwnBodyStats, ViewStats, WeaponStats } from './play';
import type { KitState } from './kit';
import type { AudioStats } from './audio';
import type { GrenadeStats, KitItem, ThrowInfo } from './grenade';
import type { RocketStats } from './rocket';
import type { EphFrame } from './ephFrame';

/** M7: the equipment as the hook shows it (`ViewerHook.equipment`). */
export interface EquipmentStats {
  /** The three equipment slots' item ids and names, kit order. */
  slots: { id: number; name: string | null }[];
  /** What is in the hand: a throwable or charge, the Detonator, a launcher's name, or null for the firearm. */
  held: string | null;
  rocket: RocketStats;
  /** The HUD weapon box's icon and count as drawn this frame. */
  icon: string;
  count: number;
  /** The fire-mode cell's round icon (a launcher's), or null. */
  roundIcon: string | null;
}
import type { ThrowPoseStats } from './throwPose';
import type { WhiteOutState } from './flash';
import type { TraversalStats } from './traversalPage';
import type { DoorPage } from './doorPage';
import type { GatePage } from './gatePage';
import type { TauntsState } from './matchTaunts';
import type { ChatState } from './matchChat';
import type { VoiceState } from './voice/voiceClient';
import type { DevEditorState } from './tauntDevState';
import type { TurretPage } from './turretPage';
import type { DrawnTurretPart, TurretPlacementView } from './turretHook';
import type { PlaytestHookStats } from './playtestSession';
import type { DevSeen } from './devSeen';
import type { RenderStats } from './renderStats';
import type { BodiesInView, FrameHash, FrameHashOptions, FrameHashSize } from './frameHash';
import type { FrameDiagVariant, FrameState } from './frameDiag';

/**
 * The debug hook `main.ts` hangs on `window` and Playwright drives: an exact camera pose, the numbers the
 * screenshot test asserts on, and the toggle states.
 *
 * It lives in its own file so that there is one declaration of the shape rather than two that can drift:
 * `main.ts` assigns `window.__viewer` and `e2e/viewer.spec.ts` reads it, both against the interface below.
 * The `declare global` is what makes the property exist on `Window` — the alternative was a cast to `any`.
 */
export interface ViewerHook {
  /** TAUNTS (`./matchTaunts`, research 301): the Chat menu, the five, the taunts heard; `?devmode`'s SETUP TAUNTS (`./tauntDevEditor`). */
  taunts(): TauntsState & DevEditorState;
  /** TACTICAL ORDERS and MESSAGES (`./matchChat`, research 302): the five messages, the communications heard. */
  chat(): ChatState;
  /**
   * Sprint 20, SVC-20b-page (`./voice/voiceClient`, research 226 §3): the voice frames sent and heard, the speaker heard,
   * the page's channel's floor holder, the last block's tone level, and whether there is a headset.
   */
  voice(): VoiceState;
  /**
   * MATCH-01 (`./startMenu`, research 266 §8): the in-round START menu -- open, the cursor, the rows placed at the open
   * and their labels as drawn. A test aid (a browser adaptation): read only, the menu's own state.
   */
  startMenu(): StartMenuState & { labels: string[] };
  /** Read-only state of the native in-match Options adaptation. */
  settings(): ReturnType<NativeSettings['state']>;
  /** The stored Options and the camera values this frame, like the front-end match's read-only hook. */
  options(): PlayOptions & { pitchInverted: boolean; bob: boolean };
  /** `?devmode`'s SETUP TAUNTS button pressed (a development build's; nothing otherwise). */
  openTauntEditor(): void;
  loading(): { visible: boolean; blocked: boolean; map: string | null; picture: string | null; missing: string[] };
  /**
   * MULTIPLAYER (web sprint 3): the match as the page sees it, or null outside one: the connection, the page's id,
   * role and team, the bodies drawn, the corrections taken, the round trip, the snapshot rate, the rows.
   */
  net?(): {
    state: string; id: number; role: string; team: string | null; queue: number; remotes: number;
    /** Each other body: its feet, alive, and (protocol 7) the id of the item in its hand and the slot it is in. */
    bodies: { id: number; feet: number[]; alive: boolean; weapon: number; slot: number }[];
    corrections: { small: number; snapped: number; largest: number }; rtt: number; snapshotRate: number; feet: number[] | null;
    /** A player in a room no round has started in: waiting for the other side, or in the launch countdown (`NetPage.waitingRoom`). */
    waiting: boolean;
    /** HX-OBEY: the hostages as the room last told them (`NetPage.hostages`): the AI's top state (9 follows), the leader, the unit. */
    hostages: { id: number; alive: boolean; ai: number; leader: number | null; unit: number }[];
    /** HX-OBEY: the order offered on the hostage under the crosshair (`HostagePage.offer`: FOLLOW! or HOLD POSITION), or null. */
    offer: { hostage: number; cmd: 4 | 5; text: string } | null;
    /** HX-OBEY: why nothing is offered (`HostagePage.why`: the step that stopped the offer), or null when one is. */
    offerWhy: string | null;
  } | null;
  setCamera(pose: Partial<Pose>): void;
  pose(): Pose;
  /**
   * The renderer's program links (`./linkLog`, research 90 issues #21 and #23): the counts since the page came up
   * (`sync`: links a frame waited for), the async links in flight, and the records since `since` (`performance.now()`).
   */
  links(since?: number): {
    now: number; total: number; sync: number; pending: number; records: LinkRecord[];
    /** When each warm-up stage of the map on screen finished (`performance.now()`): `walk`, `props`, `world`. */
    warmed: Record<string, number>;
  };
  stats(): {
    triangles: number; backend: Backend; diagnostics: string[]; loadMs: number; map: string | null;
    collisionPolys: number; untexturedDraws: number; shadowDraws: number; alternateDraws: number; spawns: Spawns | null;
    /** Draws carrying a detail pass (W1.6), the column `tools/map-health.ts` lists. */
    detailDraws: number;
    /**
     * Where the camera opened on this map (W1.4b, `./stand`): spawn A's (x, z), `EYE` over the ground probe's
     * floor there (`floor`), or over A's recorded y where `floor` is null. Null for a map with no measured spawns.
     */
    stand: Stand | null;
    /** The disc's spawn slots the spawn overlay holds, per side: 24 a side on 20 maps, 25/24 on two (W1.5b). */
    slots: { a: number; b: number };
    /** Where the map on screen was read from: the served tree, the player's own disc image (W1.7) or a picked folder (DA-3), or the extraction kept in this browser (DX-3). */
    source: 'http' | 'iso' | 'dir' | 'stored';
    /**
     * The player's body (W2.1, `./bodyView`): its model, counts, gear, height and eye line, where it stands, and
     * whether it is shown; null on a map whose body did not decode.
     */
    body: (BodyView['stats'] & { visible: boolean }) | null;
    /**
     * The body's clips (W2.2b, `./animator`): the clip playing, its fractional key, the cross-fade's weight (1 settled)
     * and the clip it leaves, the keys a second, the upper-body layer; null with no body, no `MOTION_P.ZAR`, or before
     * the play mode is first entered.
     */
    anim: AnimStats | null;
    /**
     * The view the frame is drawn with (`./play`): `third` (the game's camera) in play, `scope` while zoomed (the
     * view from the head), `fly` otherwise, and the drawn camera's pose. The walk's camera in detail is `camera()`.
     */
    view: ViewStats;
    /**
     * The night vision's colour row while the goggles are on (`./nightVision`: `0.33 x LensFX_NVG.rgb`,
     * `3.03 x .a`, VU1 command 0x5c on every lit colour), null with them off.
     */
    nightVision: [number, number, number, number] | null;
    /**
     * The scope's lens (`./sights` `scopeLens`, research 94 §C7): the zAnim a scoped view plays (`to_thermal_lens_fx`
     * with the thermal scope in the kit), and the four row colours its `SCALE_COLOR`s put on the lit colours (null: off);
     * the scope node the held primary shows (`scope`, `thermal_scope`; null: its model has neither).
     */
    lens: { effect: string | null; rows: [number, number, number, number][] | null; node: string | null };
  };
  toggles(): Record<ToggleName, boolean>;
  chromeHidden(): boolean;
  panelCollapsed(): boolean;
  flares(): [number, number, number][];
  lines(): { texture: string | null; min: [number, number, number]; max: [number, number, number] }[];
  sliders(): Record<SliderName, number>;
  /** Walk or fly (W1.4, `./walk`): what `G` and the panel's switch toggle. */
  mode(): 'walk' | 'fly';
  /**
   * False when walk was asked for and there is no floor to stand on, under the camera or at spawn A; when walk was asked
   * for in Explore; and when fly was asked for in Play without `?devmode` (`./flyAccess`, owner 2026-09-29).
   */
  setMode(mode: 'walk' | 'fly'): boolean;
  /** reCOM mode (the settings' Mode switch, `./features`): switched when `on` is given (as the visitor would), then read. */
  recom?(on?: boolean): boolean;
  /** Whether the disc page (`#disc-page`, `./source`) stands over the canvas. */
  discPage?(): boolean;
  /**
   * The load budget's phase marks (PLAT-29a, `./loadBudget`, research 100): the first time each phase was reached, in
   * `performance.now()` milliseconds; a phase not reached (or not built yet) is absent.
   */
  phases?(): Partial<Record<LoadPhase, number>>;
  /** PLAYERS ONLINE (`./playersOnline`): the last reading of the server's rooms -- players by map archive -- or null (not known). */
  playersOnline?(): { total: number; byMap: Record<string, number> } | null;
  /** The Online setting and the connection (`./online`): the choice, the server, and `NetPage.status`'s line. */
  online?(): OnlineStatus & { choice: OnlineChoice | 'url'; url: string | null };
  /**
   * Walk mode: `seconds` of 60 Hz ticks run at once with this stick (forward 1 by default), facing the camera's
   * yaw, then the camera at the eye; the pose after. Frame-rate proof, for the route test (`e2e/walk.spec.ts`).
   */
  walkFor(seconds: number, input?: { forward?: number; right?: number }): Pose;
  /** Walk mode: the mover's feet, or null in fly mode. */
  feet(): [number, number, number] | null;
  /**
   * The release sweep (`tools/release-sweep.ts`, `tools/sweepFall.ts`): the height of the floor the walk picks under
   * (x, z) for feet at `y` -- `FUN_005b5d40`'s pick, `selectFloor(probeGround(x, z), from + STEP_PROBE_LIFT_READING, y)`, `from` the
   * feet as they were (the airborne mover's origin; `y` by default, the grounded one's) -- or null with no hull or no pick.
   */
  floorUnder(x: number, z: number, y: number, from?: number): number | null;
  /**
   * The controller (W2.7, `./gamepad`): the connected pad's id, or null, and what the camera and the mover were fed
   * on the last frame -- the pad's input merged with the touch stick's (`e2e/pad.spec.ts`).
   */
  pad(): { id: string | null; input: Input };
  /** Walk mode: in the air, crouched, the stance, and the last landing's class and speed; null in fly mode. */
  mover(): MoverState | null;
  /** Research 303: the page's VICTORY DANCE (`./victory` `VictoryPage`) and the others' playing (diagnostics only). */
  victory(): import('./victory').VictoryState & { remotes: { id: number; clip: string | null; frame: number | null }[] };
  /** Walk mode: the jump (a named placeholder impulse); false when flying or in the air. */
  jump(): boolean;
  /** Walk mode: crouch (true), stand (false) or toggle stand and crouch; crouched after, false when flying. */
  crouch(on?: boolean): boolean;
  /** The walk's look (web research 83): the body's yaw and the look's, the turn, the axes, the screen offset. */
  look(): LookState;
  /** The look's options (the mouse's mapping, the pitch ratio, the invert, the throttle); returns them all. */
  setLook(opts: Partial<LookOptions>): LookOptions;
  /** The scope's magnification for the look (1 unscoped). */
  setZoom(magnification: number, mode4?: boolean): void;
  /** An explosion this far from the player: the game's shake preset for it, if any (true when one started). */
  shake(distance: number): boolean;
  /** W2.4: the reticle -- drawn or not, and its rectangle in the drawing buffer's pixels (y down) on `frame`. */
  reticle(): {
    visible: boolean; rect: Rect | null; frame: { width: number; height: number };
    mode: 'reticle' | 'scope' | 'binoculars'; size: number; offset: [number, number]; colour: ReticleColour;
    /** WEAPON: the reticle set drawn (1 the rifle's, 0 the sidearm's) and the accuracy pip (alpha 0..128, PS2 px offset). */
    type: number; pip: { alpha: number; offset: [number, number] | null };
  };
  /**
   * Research 84 (`./zoom`): the view state (`body+0x200`: 0 third person, 1 first person, 3 night vision, 4 the 9x view, 5+
   * the scope), its name, the magnification on screen, the vertical FOV it gives, and the look's scale.
   */
  zoom(): { state: number; view: ZoomView; magnification: number; fov: number; lookScale: number };
  /** d-pad Up / Down (`FUN_005445b0` / `FUN_00544400`), and the right button's step (in, and out from the last). */
  zoomIn(): number;
  zoomOut(): number;
  cycleZoom(): number;
  /** The fire mode (SEMI, BURST, AUTO), and `B`'s switch (not while scoped): the new mode. */
  fireMode(): string;
  switchFireMode(): string;
  /**
   * M4 (research 94 §C4.2, R94.16): the fire mode's launcher round -- its item id, name, arming distance (units) and
   * HUD icon -- or null for a firearm mode. The reticle's grey is not this round's: it is `./firearms` `armingGreyOf` of
   * the selected record, a rocket launcher's or its rocket's only (ARMING-GREY, issue #300).
   */
  fireRound(): { id: number; name: string; armingDistance: number; icon: string | null } | null;
  /** Research 84 (`./accuracy`): the reticle's size, target, knock, sway, the pull's rounds, and the cone (tangents). */
  accuracy(): AccuracyState & { cone: Cone };
  /** The walk's stance (W2.2b, `./walk`): what `C` and the touch C button change (tap: stand/crouch, hold: prone). */
  stance(): Stance;
  /** Sets the stance, walking or not; false for a name that is not a stance. */
  setStance(stance: Stance): boolean;
  /**
   * W2.1: the walk's camera as last drawn -- third person or the scope, the eye and the look-at target (world), the root
   * height the target stands on, the camera's pitch in degrees -- or null in fly mode.
   */
  camera(): WalkCameraState | null;
  /**
   * W2.5 (`./fire`): the shots fired, the magazine, where the last round landed (null for a miss or before one), and
   * the marks on the walls.
   */
  fire(): FireState;
  /**
   * The release sweep's mark heading (`tools/sweepHeading.ts`): the world's surfaces down the line from `from` along
   * `dir`, the weapon's whole range, nearest first, each with its `PENETRATION` (`Fire.surfacesAlong`); null with no hull.
   */
  surfacesAlong(from: [number, number, number], dir: [number, number, number]): { distance: number; penetration: number; material: number }[] | null;
  /** W2.5: one round now, as a click would fire it (the rate, the magazine, walking); null when none went. */
  shoot(): Shot | null;
  /**
   * Web research 86 (`./traversalPage`): the traversal move (ladder, climb, hang, slide), its clip and key, the climb
   * prompt, the peek value, the water's depth, the map's ladder count and the last events; null in fly mode.
   */
  traversal(): TraversalStats | null;
  /** The action button (Cross; X on the keyboard): a door under the reticle, the climb offered, the ladder's slide. False in fly mode. */
  action(): boolean;
  /**
   * EPH-2, a browser adaptation (`./ephFrame`): the emulator parity harness's per-frame read -- the walk's tick, stance,
   * posture and the action holding the mover. Null unless the page was opened with `?devmode`. Read only.
   */
  ephFrame(): EphFrame | null;
  /** DOORS (`./doorPage`): each door's node and state, the door under the reticle, the last action on one. */
  doors(): ReturnType<DoorPage['stats']>;
  /**
   * MAP-07 (`./gatePage`; a test instrument, no original): Death Trap's and Enowapi's lever gates as the page draws them
   * -- each `gate_moveN`'s node, path and parent-space offset, following the room's door tail. Empty without gates.
   */
  gates?(): ReturnType<GatePage['stats']>;
  /** DOORS: the action on door `i` from the feet, the reticle aside; false when refused (mid-swing, locked, none). */
  useDoor(i: number): boolean;
  /** The world's nodes whose own flag differs from the opening one (`WorldState.states`: a base's `healthy` off), or null without a world. */
  worldStates(): { path: string; active: boolean }[] | null;
  /** Whether the world's node at `path` is active, its ancestors' flags included (`WorldState.isActive`), or null without a world. */
  worldActive(path: string): boolean | null;
  /**
   * Test-room model pack: the loaded map's level-piece ids (`world:<name>#<n>`), disc order, or null when this load
   * did not ask for the list (`devtools`, `devmode`, or `modmodels`). Copy `id` into `models.json`.
   */
  worldPieces(): { id: string; name: string; index: number; ordinal: number; pivot: [number, number, number] }[] | null;
  /**
   * PB-9b's development read (research 284 s8; an instrument, no behaviour): the bases' pulse the page's world draws --
   * the display programs running (`pulse_terrorist`, `pulse_seal`) and each outline's last opacity (`WorldState.basePulse`),
   * which `worldStates()` and `effects()` do not see; null without a world.
   */
  basePulse(): { running: string[]; opacity: Record<string, number> } | null;
  /** The peek held, as the d-pad (Q / E) would hold it: -1 left, 1 right, 0 off. */
  setLean(side: -1 | 0 | 1): void;
  /**
   * Hold the third-person camera at this peek (-1 left .. 1 right), or release it (`null`). A test-room instrument:
   * the body lean still goes through the side ray (`setLean`, Q / E), which refuses a lean flush into a wall and
   * leaves `traversal().peek` at 0. This pin moves the third-person camera's peek, the game's eye with it (the pass's:
   * the shot's and the order's, `fireAim`), not the body's lean, so that refusal can be looked at.
   */
  setPeek(value: number | null): void;
  /**
   * The sound (socomlegacy/docs/research/81, `./audio`): unlocked or not, the banks loaded, the samples decoded, the sounds
   * played by name, the events sent, the plays dropped and why, the last few plays.
   */
  audio(): AudioStats;
  /** The sound's volume (1 the default level) and mute; the stats after. The UI's panel calls `GameAudio` itself. */
  setAudio(settings: { volume?: number; muted?: boolean }): AudioStats;
  /**
   * WEAPON (`./play`, `./weaponRaise`, `./weaponPose`, `./heldItem`): whether the rifle is in the SEAL's hands, its
   * raise (the Fire set's weight, up or down, the countdown), the layers' clips and weights, and the muzzle in the world.
   */
  weapon(): WeaponStats;
  /**
   * PB.R2's goldens (`./play` `ownBodyRead`): the own body as drawn -- the gear shown (the carrier's Satchel), the main
   * clip and its key, the throw layer's clip, the weapons' mounts. A development instrument, read-only; the menu match's
   * hook has the same line.
   */
  ownBody(): OwnBodyStats;
  /** WEAPON (`./kit`): the firearm in use, where each weapon rides, and the swap playing. */
  kit(): KitState;
  /**
   * The runtime kit (web sprint 4, `./loadout`): the loadout on the body (five item ids), its two firearm slots'
   * records' names and held models, and the pick waiting for the next spawn (the developer's `&kit=` or `setLoadout`).
   */
  loadout(): {
    loadout: number[]; records: string[]; models: (string | null)[]; pending: readonly number[] | null;
    /**
     * Web sprint 5 S2: the page's side's character type for its next spawn (`type`, 0-3 within the side) and the one
     * its body was rebuilt as (`bodyType`), and the body's model (`model`; null without one).
     */
    type: number; bodyType: number; model: string | null;
  };
  /** A pick for the page's side, carried from its next spawn (R94.3); the pick now waiting. The menu's path (M8). */
  setLoadout(ids: readonly number[]): readonly number[] | null;
  /**
   * Web sprint 5 S2 (the ARMORY's seam, S3): the page's side's character type for its next spawn (`ChangeCharacterType`,
   * research 95 §4.2 S1a) -- in a match the room is told at once (protocol 9). False, nothing changed, for a type the
   * map's side does not offer.
   */
  setCharacterType(type: number): boolean;
  /**
   * Web sprint 5 S3, the ARMORY (`./armory`): whether its data is in and it can open, whether it is open, its screen,
   * cursor column, committed type, row and kits (item ids per column), the valves its scripts read, and whether it takes
   * input now (not suspended); the stored profile for this map and side (null: none). S3 part 2: the weapon view as the
   * scripts set it (`Armory.preview`: the models shown, the four bars' scales when shown, the name, the fire mode, the
   * description as typed so far and whether it is done, the tips; null while closed) and whether each shown model is
   * held by the 3D pass.
   */
  armory(): {
    ready: boolean; open: boolean; screen: string | null; column: number | null; committed: number | null; row: number | null;
    kits: number[][]; valves: Record<string, number> | null; taking: boolean;
    profile: { charSet: number; items: number[]; valid: boolean } | null;
    preview: { models: string[]; bars: number[] | null; name: string; fireMode: string; description: string; typed: boolean; tips: string } | null;
    modelsHeld: boolean;
  };
  /** Opens the ARMORY as joining a match does (W5.R1); whether it opened. */
  openArmory(): boolean;
  /** A key as the page's keydown gives it to the ARMORY (`KeyboardEvent.code`); whether it took it. */
  armoryKey(code: string): boolean;
  /**
   * WEAPON EXCHANGE (web sprint 4, M8/M9; `./weaponExchange`): the menu's screen, cursor, picker and kit (the room's
   * answer once one came), the picks since it opened, the side's list sent as the `loadout` request, the gate, the
   * dead's prompt lines as drawn (null: none), and whether the touch button shows (null: not on the page).
   */
  weaponSelect(): {
    screen: 'closed' | 'list' | 'picker'; slot: number; category: string; item: number; loadout: number[];
    picks: { slot: number; id: number }[]; sent: { slot: number; id: number }[];
    gate: { inMatch: boolean; alive: boolean; cameraOnSelf: boolean; spectator: boolean };
    prompt: string[] | null; touchButton: boolean | null;
  };
  /** A key as the page's keydown gives it to WEAPON EXCHANGE (`KeyboardEvent.code`); whether the menu took it. */
  weaponSelectKey(code: string): boolean;
  /** WEAPON: L1 / L2 -- takes the rifle or the Mark 23 up (the swap's clip); false when refused or already in the hand. */
  selectWeapon(item: 'rifle' | 'pistol'): boolean;
  /**
   * WEAPON: the R2 inventory alive (`./inventoryMenu`): open or not, the highlighted slot, the idle seconds, the
   * shoulders' slots (L1 / L2), the slot in the hand, and the parts it draws.
   */
  inventory(): {
    open: boolean; slot: number; idle: number; binds: { l1: number; l2: number }; current: number; layout: string[];
    /** Browser test instrument: the current native draw list's words, without changing menu or kit state. */
    texts?: { part: string; text: string }[];
  };
  /** WEAPON: the trigger held (true) or let go (false), as the mouse button and R1 hold it. */
  trigger(down: boolean): void;
  /** WEAPON: shows or hides a piece of the SEAL's gear by its `character.rdr` name (`Satchel`: the bomb carrier's). */
  setGear(name: string, on: boolean): boolean;
  /**
   * The in-game HUD (`./hud`, socomlegacy/docs/research/87-hud.md): drawn or not, what it shows, and each element's rectangle in
   * the drawing buffer's pixels (y down) on `frame`.
   */
  hud(): HudView;
  /** The HUD's inputs the walk does not drive yet (a prompt, a message, the fire mode, the team list), for the tests. */
  setHud(patch: HudPatch): HudView;
  /**
   * The frag grenade (`./grenade`, socomlegacy/docs/research/85): the slot, the phase, the power, the grenades left and in the
   * air, the last throw, the bounces and the explosions, and the M67's numbers.
   */
  grenade(): GrenadeStats;
  /**
   * Throws a grenade as if the button were held `holdSeconds` (default 1) then let go, walking: the grenade taken up
   * first. `immediate` (default) lets go now rather than at the clip's release. Null when none can be thrown.
   */
  throwGrenade(holdSeconds?: number, immediate?: boolean): ThrowInfo | null;
  /** Takes the grenade up (true), puts it away (false) or toggles; the slot after. */
  equipGrenade(on?: boolean): boolean;
  /** The debug trail behind the grenades in flight (off: the game draws none). */
  grenadeTrail(on: boolean): void;
  /** Clears the grenades, the effects and the marks, and refills the pouch. */
  resetGrenades(): void;
  /** Takes up a kit item (`rifle`, `M67`, `HE`), as the keys 1, 4, 5 do; false when it cannot be. */
  selectItem(item: KitItem): boolean;
  /** The throw's clip on the body (`./throwPose`): the clip, its phase, its weight over the locomotion. */
  throwClip(): ThrowPoseStats;
  /** The flashbang's white-out on the screen (`./flash`): its level, time into it, opacity and length. */
  whiteOut(): WhiteOutState;
  /** Sets off the placed claymores (the `9` key; the claymore's own trigger is not ported); the count set off. */
  detonateCharges(): number;
  /**
   * M7 (web sprint 4; spec W4.R5): the equipment -- the three slots' items in kit order, what is in the hand, the
   * rocket launcher's state (the rounds, the last launch and backblast) and the HUD box's icon and count.
   */
  equipment(): EquipmentStats;
  /** M7: the kit's equipment slot `slot` (1-3) taken up, as the keys 3, 4 and 5 do; false when it cannot be. */
  selectEquipment(slot: 1 | 2 | 3): boolean;
  /** M7: the Action button's C4 plant at a C4 target (research 94 §C5.1); false when refused. */
  plantC4(): boolean;
  /**
   * EFFECTS (`./effects`, socomlegacy/docs/research/89): the map's effect data loaded or not, the animations played by name,
   * the runs live, the casings in the air and the last one's place, the bounces, the particles, the sounds.
   */
  effects(): EffectStats;
  /**
   * EFFECTS: plays an animation of the map's zAnim archives (`bullet_hit_stone`, `frag_grenade_stone`, `muzzle_m4` ...)
   * at `at`, or 30 units ahead of the camera: as an impact (the point, the normal up) or as a muzzle effect (a node
   * whose barrel runs to the camera's right, the flash seen from the side); false when the map has none of that name.
   */
  playEffect(name: string, at?: [number, number, number], kind?: 'impact' | 'muzzle'): boolean;
  /** EFFECTS: holds every effect where it is (true) or lets them run (false), for a picture of a three-frame flash. */
  pauseEffects(on: boolean): void;
  /** The tactical map (`./tacMap`, research 87 §9): open or not, its zoom (world units across its box), pan, heading. */
  tacMap(): { open: boolean; zoom: number; pan: [number, number] | null; yaw: number; age: number };
  /** Opens or closes it as `M` (SELECT) does, the heading the camera's now. */
  setTacMap(open: boolean): { open: boolean; zoom: number; pan: [number, number] | null; yaw: number; age: number };
  /** EFFECTS: stops every effect and drops its particles (a test's clean slate: headless drawing is slow under smoke). */
  clearEffects(): void;
  /**
   * W0-gate (`./turretHook`, MAP-10b's `./turretPage`): the map's placed manual turrets (their roots, origins, facing,
   * gun pivot, limits in degrees, reach), the turret held (the room's word), the one in reach, the HUD's prompt and each
   * turret's wire state. Read only (`e2e/turretMount.spec.ts`).
   */
  turrets?(): { placements: TurretPlacementView[] } & ReturnType<TurretPage['stats']>;
  /**
   * W0-gate (`./turretHook`): every drawn part beneath a placed turret's root -- its path, its vertices' own bounds as
   * uploaded and those bounds where the part is drawn now -- for the page's half of `test/turretParts.test.ts`'s bbox
   * check (`e2e/turretSky.spec.ts`). Read only.
   */
  turretParts?(): DrawnTurretPart[];
  /**
   * W0-gate, dev only (present with `?devmode` alone, absent otherwise): stands the walk's mover at the feet (x, y, z)
   * facing `yaw` (degrees; the look's yaw when absent), the floor picked from the feet + `STEP_PROBE_LIFT_READING` as a
   * spawn picks it (`WalkMode.respawn`); in the page's own match the room's mover is stood there too, so the room's
   * mount test (`canMount`) sees the same feet. False off the walk, with no floor, or in a match on a server (a room this
   * page does not hold is never moved). For the turret spec (`e2e/turretMount.spec.ts`): the test room cannot walk to a
   * turret (research 213; the plan's Log 2026-10-06 ~01:00).
   */
  teleport?(x: number, y: number, z: number, yaw?: number): boolean;
  /**
   * Browser adaptation (`?devmode` only): ends the local seat (`Room.devKill`) so a round reset can be checked.
   * Not a game rule. False with no solo room, or when that seat is missing or already dead.
   */
  kill?(): boolean;
  /**
   * Browser adaptation (`?devmode` only): the action-pick log. `true` prints every sample; `false` prints when the
   * reason changes. Each line is `[action] <why> hit= action= opaque= switch=`.
   */
  actionPickLog?(everyFrame: boolean): void;
  /**
   * PT-05 (web sprint 33, research 241; a playtest instrument with no original): the playtest room's session -- its id,
   * the segment and the replay tick, the marks taken, the video ring's seconds held, the badge's values. Assigned on the
   * live hook by `./playtestSession` at its mount (`?devmode&playtest=` only; W33.R2); absent otherwise.
   */
  playtest?(): PlaytestHookStats;
  /**
   * RE-5 (web sprint 38, research 249 §7; a playtest instrument with no original): what a replay's seek is seen by --
   * `BombPage.state()`, the world bomb's drawn model, each drawn body's clip, death and gear (the carrier's Satchel), the
   * ghosts, and the HUD's drawn quads (`./devSeen`). A development build's only: hung under a literal
   * `import.meta.env.DEV` (`./main`), absent from every `vite build` (`test/devSeen.test.ts`).
   */
  devSeen?(): DevSeen;
  /**
   * PRF-4 (product track, a dev instrument; `./renderStats`): the page's renderers' `renderer.info` counts -- the last
   * frame's draw calls (`drawCalls`), triangles, points and lines, the geometries, textures and programs alive (shader
   * stages on the page's renderer) and three's byte estimates (`bytes`) -- each by its label,
   * and their sum. A development build's only, under the dev panel's gate (`import.meta.env.DEV` and `?devmode`, `./main`):
   * absent from every `vite build`, and until the renderer is up (`test/renderStats.test.ts`).
   */
  renderStats?(): RenderStats;
  /**
   * CPS.R9 (e) (product track, a dev instrument; `./frameHash`): the world scene rendered with the page's camera into a
   * target of `size` (the drawing buffer's by default) -- the canvas pass's twin in samples, colour space and format --
   * read back and hashed (FNV-1a 64), with that render's draw calls. The frame identity gate compares target with target,
   * before and after a change, never with the canvas (`e2e/zz-frame-identity.spec.ts`). A development build's only,
   * under the dev panel's gate (`import.meta.env.DEV` and `?devmode`, `./main`), absent from every `vite build`
   * (`test/frameHash.test.ts`). `{ keep: true }` returns the bytes hashed too (cps-frame-hash-2: a mismatch located).
   */
  frameHash?(size?: FrameHashSize, options?: FrameHashOptions): Promise<FrameHash>;
  /**
   * cps-frame-hash-2 (product track, a test-only instrument): `true` holds the page's frame clock (`./frameTime`
   * `FrameTime.hold`) -- the frame's `dt` and real seconds 0, so the world's clocks (the scrolls, the effects and
   * particles, the scene programs, the camera, the bodies, the timed rules) stand still while the frame identity gate
   * hashes; `false` lets it go. A development build's only, under the same gate as `frameHash` (`test/holdFrame.test.ts`).
   */
  holdFrame?(on: boolean): void;
  /**
   * cps-frame-hash-3 (product track, a test-only instrument; `./frameHash` `followSeat`): the page's spectator (the
   * replay's watcher) follows the `n`-th living body in seat order by its own control (Right released `n + 1` times from
   * the free camera), so the frame identity gate's hashed view holds the bodies the replay moves; the followed id, or null.
   * A development build's only, under the same gate as `frameHash` (`test/frameHash.test.ts`).
   */
  followSeat?(n: number): number | null;
  /**
   * cps-frame-hash-3 (product track, a test-only instrument; `./frameHash` `bodiesInView`): the drawn bodies visible, on the
   * page camera's layers and in its frustum -- their count and ids, of the drawn. The same gate as `frameHash`.
   */
  bodiesInView?(): BodiesInView;
  /**
   * cps-frame-hash-4 (product track, a test-only instrument; `./frameDiag`): one of the frame identity gate's diagnosis
   * variants switched on (the previous put back first), or every one put back (`null`); the variant set, or null when it
   * could not be (`staticCamera` without a follow). The same gate as `frameHash` (`test/frameDiag.test.ts`).
   */
  frameDiag?(variant: FrameDiagVariant | null): FrameDiagVariant | null;
  /**
   * cps-frame-hash-4 (`./frameDiag` `frameState`): what the next render is drawn from -- the page camera's world and
   * projection matrices whole, each drawn body's pose and bone-palette hashes -- after the variant's own step before a
   * read (`noShadow`: the shadow cleared). Read in the same task as `frameHash`, so no page frame comes between.
   */
  frameState?(): FrameState;
  /** The build's label as the panel shows it: `rev <hash>[-dirty] · built <UTC minute> UTC`. */
  revision: string;
}

declare global {
  interface Window {
    __viewer: ViewerHook;
    /**
     * Chain Reaction disc check (`./craneHook`). A read of each hook's pause and of the drawn panels and lever
     * meshes. Assigned by the test room and, in a development build, by a mounted match. Absent until then.
     */
    __crane?: () => CraneHookView[];
    /**
     * The offline room's last crane press dropped `missed` (`CraneActionMiss`). A development build's only
     * (`import.meta.env.DEV` in `./main`): the named point, the eye, the ray, the room's faces, the nearest
     * distance, the slack, and both offsets at that tick. Absent from a release build. Read `__room.lastActionMiss`.
     */
    __room?: { readonly lastActionMiss: CraneActionMiss | null };
  }
}
