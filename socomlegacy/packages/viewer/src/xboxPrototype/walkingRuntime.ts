import { Matrix4, type Group, type PerspectiveCamera } from 'three';
import { FlyCamera } from '../camera';
import { padInput } from '../gamepad';
import type { PlayData } from '../motionTable';
import { actionRoots } from '../mover';
import { NetClient, type NetOptions } from '../net/client';
import type { Team, ServerEvent } from '../net/protocol';
import { Play } from '../play';
import { GamePad } from '../setupPad';
import { WalkMode } from '../walk';
import { tracerKindFor, tracerRound, UNITS_PER_METRE, type Loadout, type WeaponRecord } from '@s2u/scene';
import type { EffectData } from '../effectData';
import type { FireEvent, FireWeapon } from '../fireCore';
import { walkingEffects, type WalkingCallerNode } from './walkingEffects';
import { walkingGrenades } from './walkingGrenades';
import { walkingMenus, type WalkingMenus } from './walkingMenus';
import { walkingExchange } from './walkingExchange';
import { walkingTalk, type WalkingTalk } from './walkingTalk';
import type { MatchTauntsDeps } from '../matchTaunts';
import type { SoundData } from '../soundData';
import type { ScoreRow } from '../net/protocol';
import { padButtonsDown } from '../weaponExchange';
import type { StartMenuOptions } from '../startMenu';
import { throwPoseEnds } from '../throwPose';
import { blindGlow, blindWash, glowLength } from '../flashRules';
import { BLIND_KEYS } from '@s2u/scene';
import type { SceneObject } from './sceneFrame';
import { BAKED_LOADOUT, typeLoadout, wireKit } from '../loadout';
import type { WalkingSound } from './sound';
import { bodyModel, type PrototypeHud, type SceneFrame } from './sceneFrame';
import type { WalkingMap, BodyRig } from './runtimeAssets';
import { walkingHud } from './walkingHud';
import { aimPoint } from '../playerCamera';
import { handReticleType } from '../reticle';
import { scopeBitmaps } from '../sights';
import { prototypeLobbyLifecycle } from './lobbyLifecycle';
import { prototypePlayBody } from './playBody';
import { prototypeCombat } from './combatRuntime';
import { bindPrototypeCombat, PrototypeCombatInput, TriggerOwner } from './combatInput';
import { walkingMatch } from './walkingMatch';
import { corpseShownS } from '../net/deaths';
import { prototypeRemotes } from './remoteRuntime';
import { prototypePerception } from './perception';
import { walkingWorld } from './walkingWorld';
import { walkingObjectives } from './walkingObjectives';
import { prototypeHands } from './hands';
import { teamTagInput, teamTags } from '../hudTags';
import { readNameTags } from '../nameTags';
import type { HudState } from '../hudState';

export type PrototypeOnline = Pick<NetOptions, 'url' | 'map' | 'name' | 'game'> & {
  /**
   * The real front end's hand-off (a browser adaptation, `./matchLoader`): the game lobby's own client, already welcomed
   * and launched, with the room's events it heard while the map loaded. The runtime rebinds it to its walk, replays the
   * events, and gives it back at `release` -- it never opens or closes that client, and it shows no lobby controls.
   */
  adopt?: { client: NetClient; events: readonly ServerEvent[] };
};

/** Browser test adaptation: existing movement/animation/wire, independent of either renderer.
 * Base team bodies, shared firearm simulation, door/world state, bomb and traversal.
 */
/** `../netPage` `fireWeaponOf`: a record as the round's event names its weapon. */
const fireWeaponOf = (r: WeaponRecord): FireWeapon => ({ name: r.name, id: r.id, range: r.maximumRange * UNITS_PER_METRE, fireAnim: r.fireAnim ?? null,
  sounds: r.sounds ? { ...r.sounds } : { close: null, med: null, far: null, reload: null } });

/** What the page lends the match's menus: the session's option store, the map's HudCLOC captions and its title. */
export interface WalkingExtras {
  startMenuOptions?: StartMenuOptions; captions?(): Readonly<Record<string, string>> | null; title?: string | null;
  /** The session's five taunts and five messages, the lobby's talk input handed on, and the map's sound data (the vocals, the defaults). */
  taunts?(): readonly (string | null)[]; messages?(): readonly (string | null)[]; talk?: MatchTauntsDeps['talk']; soundData?(): SoundData | null;
  /** An instrument's switches (the experiment page's `?menus=0`, `?talk=0`): a part left unmounted for a before-and-after measure. */
  without?: { menus?: boolean; talk?: boolean; voice?: boolean; voiceHud?: boolean; voicePermission?: boolean };
  /** The session's game variables (`../matchMount` `MatchMountOptions.gameVars`): TEAMMATE NAMES read from them at the mount; absent, 1. */
  gameVars?: { valve(name: string): number | null };
}

/**
 * XBOX-TAGS-FEED (OT.R148): the HUD's tag setters the walking runtime feeds as the standard engine does (`../matchMount`):
 * the over-head tags each frame, TEAMMATE NAMES and this browser's Name tags look at the mount. RawHud is a HudState.
 */
export type WalkingRuntimeHud = PrototypeHud & Pick<HudState, 'setTeamTags' | 'setTeammateNames' | 'teammateNamesOriginal'>;

export function walkingRuntime(canvas: HTMLCanvasElement, map: WalkingMap, play: PlayData, models: readonly BodyRig[],
  online?: PrototypeOnline, hud?: WalkingRuntimeHud, effectData?: EffectData | null, extras: WalkingExtras = {}) {
  const owned: (() => void)[] = [];
  try { return mountWalking(canvas, map, play, models, owned, online, hud, effectData ?? null, extras); }
  catch (error) { for (const release of owned.reverse()) { try { release(); } catch { /* Preserve the mount failure. */ } } throw error; }
}
function mountWalking(canvas: HTMLCanvasElement, map: WalkingMap, play: PlayData, models: readonly BodyRig[], owned: (() => void)[],
  online: PrototypeOnline | undefined, hud: WalkingRuntimeHud | undefined, effectData: EffectData | null, extras: WalkingExtras) {
  const focus = () => canvas.focus();
  canvas.tabIndex = 0; canvas.addEventListener('pointerdown', focus);
  owned.push(() => canvas.removeEventListener('pointerdown', focus));
  const fly = new FlyCamera(canvas, { kbm: () => document.activeElement === canvas });
  owned.push(() => fly.dispose());
  const walk = new WalkMode(fly), pad = new GamePad({ pressClock: () => performance.now() });
  const at = models[0]!.at?.position ?? map.origin;
  fly.setScale(map.metersPerUnit); fly.setAspect(canvas.width / canvas.height);
  fly.setClipPlanes(map.camera?.nearPlane ?? 1, map.camera?.farPlane ?? 10000);
  fly.setPose({ x: at[0], y: at[1] + models[0]!.height, z: at[2], yaw: (models[0]!.at?.yaw ?? 0) * 180 / Math.PI });
  walk.setGround(map.ground, [...at]);
  walk.setMotionTable(play.table ? new Map(play.table) : null); walk.setActionRoots(actionRoots(play.clips));
  if (!walk.setMode('walk')) throw new Error('No walkable spawn');
  walk.bindKey();
  owned.push(() => walk.unbindKey());
  walk.modeKey = false;
  const teams = new Map<number, Team>();
  const kits = new Map<number, Loadout>();
  // R4P-103 fresh review F4 (product track, the prototype's copy of the room's kits): 5-30 records (`wireKit`), so a
  // `taken` after a launcher claim -- its round appended, six -- is kept.
  const setKit = (id: number, kit?: readonly number[]) => { const k = wireKit(kit); if (k) kits.set(id, k); };
  const localViews = models.map(prototypePlayBody), localPlay = new Play();
  let localModel = 0;
  localPlay.setBody(localViews[0]!, models[0]!); localPlay.setClips(play);
  let client: NetClient | null = null, sound: WalkingSound | null = null, disposed = false;
  let released = false, offEvents: (() => void) | null = null, offHeld: (() => void) | null = null;
  let before = padInput(null), beforeGame = before;
  const frame: SceneFrame = { camera: fly.camera as PerspectiveCamera, others: [], body: { id: 0, modelIndex: 0,
    position: at, yawRadians: models[0]!.at?.yaw ?? 0, palette: localViews[0]!.palette,
    local: localViews[0]!.skeleton.local, world: localViews[0]!.skeleton.world } };
  // Lean experiment telemetry, updated from the snapshot already taken for each
  // simulation/render frame. The text report deliberately updates less often.
  const motion = { frame: 0, x: at[0], y: at[1], z: at[2], vx: 0, vz: 0 };
  let connectionError = '';
  // EFFECTS: the map's effect animations as particles and sounds (`./walkingEffects`); none without the map's effect data.
  const effects = effectData ? walkingEffects({ data: effectData, grid: () => walk.grid(), hull: () => walk.gridOfGround(), feet: () => walk.feet(),
    sound: (name, at, volume) => sound?.effect(name, at, volume),
    projectionAspect: map.camera ? Math.tan(map.camera.hfov) / Math.tan(map.camera.vfov) : null }) : null;
  if (effects) { frame.particles = effects.object; frame.effectMeshes = effects.meshes; owned.push(() => effects.dispose()); }
  /** A body's weapon node in the world, asked for afresh on each tick an effect places something at it (the flash rides the gun). */
  const weaponNode = (actor: () => SceneFrame['body'] | null | undefined, object: Group): WalkingCallerNode => {
    const out = new Matrix4();
    return () => { const body = actor(); return body ? bodyModel(body, out).multiply(object.matrix) : null; };
  };
  const handWorld = new Matrix4(), handBone = new Matrix4();
  /** The flashbang's blind on this page (`../flash` `WhiteOut`'s rule on numbers): the room's level (`blast.flash`), the stronger taking over. */
  const blind = { level: null as 1 | 2 | 3 | null, t: 0, started: 0 };
  /** Another player's shots this page has seen this round, for the every-fourth tracer (`../netPage` `tracerRounds`). */
  const tracerRounds = new Map<number, number>();
  let heldSpawn: Extract<ServerEvent, { type: 'spawn' }> | null = null;
  const lobby = online?.game && !online.adopt ? prototypeLobbyLifecycle({ map: online.map, id: () => client?.id ?? -1,
    send: event => client?.send(event), loaded: () => client?.reportLoaded(),
    fail: reason => { connectionError = reason; }, now: () => performance.now() }) : null;
  const kitFor = (id: number, team: Team | null) => kits.get(id) ?? typeLoadout(map.arsenal?.map ?? null, team ?? 'seal') ?? BAKED_LOADOUT;
  const panel = hud ? walkingHud(hud, map, () => client?.id ?? 0, () => kitFor(client?.id ?? 0, client?.team ?? null)) : null;
  // XBOX-TAGS-FEED: `../matchMount`'s mount line -- TEAMMATE NAMES (`DISPLAY_MP_TEAM_NAMES`, absent 1) and this browser's look.
  hud?.setTeammateNames((extras.gameVars?.valve('DISPLAY_MP_TEAM_NAMES') ?? 1) !== 0, readNameTags() === 'original');
  const remotes = prototypeRemotes({ map, models, clips: play, ownId: () => client?.id ?? 0,
    // N-07: the room leaves this seat out of `welcome.players`; its own side is the client's (`welcome.team`, `promoted`,
    // as `../main` / `../matchMount` dress the own body from `client.team`), never a stale lobby seat's.
    team: id => (id === client?.id && client.team ? client.team : teams.get(id) ?? null),
    kit: kitFor, setKit, grid: () => walk.gridOfGround(), step: (id, event, feet, yaw) => sound?.remoteStep(id, event, feet, yaw) });
  const perception = prototypePerception({ map, play: localPlay, walk, fly, targets: remotes.targets, teams,
    ownId: () => client?.id ?? 0, ownTeam: () => client?.role === 'player' ? client.team : null, online: () => !!client,
    zoom: () => ({ state: combat.zoom.state(), target: combat.zoom.target() }) });
  owned.push(() => remotes.dispose());
  let match: ReturnType<typeof walkingMatch> | null = null;
  // N-28 (a browser adaptation): Edge on Xbox maps the pad's View to the browser's Back, and its tap takes DOM focus off
  // the canvas. The pad is read whenever the page is visible (`../main` polls every frame, no focus test); the keys and
  // the mouse stay the canvas's own.
  let padReads = false;
  const canvasFocused = () => document.hasFocus() && document.activeElement === canvas;
  const enabled = () => (canvasFocused() || padReads) && !walk.isLocked() && !walk.isDead()
    && (!online || client?.state === 'open') && (!lobby || lobby.report().loaded) && !match?.screenUp() && !match?.ghost();
  const combat = prototypeCombat({ map, walk, fly, play: localPlay, online: !!online,
    loadout: () => kitFor(client?.id ?? 0, client?.team ?? null), client: () => client, enabled,
    event: event => {
      sound?.fireEvent(event);
      if (event.type !== 'round' || !effects) return;
      // `../matchFirearm`: the muzzle animation and the impact per round, the `_zoom` variant in the scope; every surface gone through struck too.
      const held = combat.weaponFrame();
      effects.onRound(event, held ? { node: weaponNode(() => frame.body, held.object), muzzle: held.muzzle } : null, walk.view() === 'scope');
      for (const t of event.through ?? []) effects.onRound({ ...event, to: t.point, normal: t.normal, material: t.material, hit: true, through: undefined, tracer: undefined, tracerKind: undefined }, null, false);
    },
    ...(effects ? { drawsTracer: effects.willDrawTracer } : {}), targetDistance: remotes.targets.distance, bodyDistances: remotes.targets.records,
    enemies: perception.count, spawned: perception.clear, handItem: () => grenades.handItem() });
  owned.push(() => combat.dispose());
  // With an item up the trigger is its wind-up and release; a shoulder's firearm puts the item away first (`../matchThrow` `takeSlot`).
  // TRIGGER-SWAP (`./combatInput` `TriggerOwner`): a press the hands took, still held, is the firearm's once they hand it over.
  const triggerOwner = new TriggerOwner({
    equipped: () => grenades.equipped(), firearmWaits: () => grenades.firearmWaits(), trigger: on => grenades.trigger(on),
    cancelHold: () => grenades.cancelHold(), rocketsLaunched: () => grenades.report().rockets,
  }, { trigger: on => combat.trigger(on), held: () => combat.fire.triggerHeld(), pulls: () => combat.fire.pulls(), pull: n => combat.fire.pull(n) });
  const inputCombat = new PrototypeCombatInput({
    trigger(on) { triggerOwner.trigger(on, enabled()); },
    reload() { if (!grenades.equipped()) combat.reload(); },
    // The shoulders take the slots the R2 inventory binds to them (L1, L2); without the menus, the two firearms.
    select(firearm) { if (menus) return menus.shoulder(firearm === 'rifle' ? 'l1' : 'l2'); grenades.putAway(); return combat.select(firearm); },
    stepZoom: how => combat.stepZoom(how), switchFireMode: () => grenades.equipped() ? undefined : combat.switchFireMode(),
  });
  const unbindCombat = bindPrototypeCombat(canvas, inputCombat, enabled); owned.push(unbindCombat);
  match = walkingMatch({ client: () => client, walk, fly, hud, ownCorpseExpired: () => localPlay.ownCorpseExpired(),
    rootOf: id => remotes.root(id), clips: () => play, flinch: window => combat.flinch(window), now: () => performance.now() });
  owned.push(() => match?.dispose());
  const world = walkingWorld({ map, walk, client: () => client, enabled, sound: () => sound,
    respawnInputActive: () => match?.respawnInputActive() ?? false });
  frame.world = world.frame; owned.push(() => world.dispose());
  const hands = prototypeHands({ play: localPlay, walk, callback: (name, at) => sound?.animCallback(name, at) });
  owned.push(() => hands.dispose());
  const setGearVisible = (id: number, name: string, on: boolean) => {
    if (id === (client?.id ?? 0)) {
      localPlay.setGearVisible(name, on);
      // Cached team views can be mounted again later. Clear the old carrier's
      // satchel there too, rather than retaining a stale visible fitting.
      for (const view of localViews) view.setGearVisible(name, on);
    } else remotes.setGearVisible(id, name, on);
  };
  // observeCommands must wrap setNetTap before NetClient installs the actual
  // sender. Bomb prediction then reads the same filtered ActionHeld commands.
  const objectives = walkingObjectives({ walk, world, hands: hands.pose, pistol: () => combat.state().weapon === 1,
    clips: play, client: () => client, enabled, respawnInputActive: () => match?.respawnInputActive() ?? false,
    sound: () => sound, hud, setGearVisible, teamOf: id => id === client?.id ? client.team : teams.get(id) ?? null,
    bodyAt: id => id === (client?.id ?? 0) ? walk.drawnFeet() : frame.others.find(actor => actor.id === id)?.position ?? null });
  owned.push(() => objectives.dispose());
  // THROWABLES, first part: other players' grenades, charges and launched rounds (`./walkingGrenades`).
  const grenades = walkingGrenades({ table: map.arsenal?.table ?? null, models: map.throwableModels ?? [], grid: () => walk.grid(), hull: () => walk.gridOfGround(),
    snapshot: () => walk.snapshot(), view: () => walk.view(), feet: () => walk.feet(), dead: () => walk.isDead(), fly, effects,
    sound: (name, at) => sound?.animCallback(name, at), ownId: () => client?.id ?? 0,
    own: { play: localPlay, walk, pose: hands.pose, client: () => client, loadout: () => kitFor(client?.id ?? 0, client?.team ?? null),
      pistol: () => combat.state().weapon === 1, viewState: () => combat.zoom.state(), handSeq: seq => combat.handSeq(seq), suspendFirearm: () => triggerOwner.suspendFirearm(),
      firearmName: () => combat.state().record.name, zoomOne: () => { combat.setZoom(1); }, report: (name, at) => { sound?.roundFired({ weapon: { name }, from: at }); },
      hand: () => { const skeleton = localViews[localModel]!.skeleton, bone = skeleton.indexOf('rhand');
        return bone < 0 || frame.body.visible === false ? null : bodyModel(frame.body, handWorld).multiply(handBone.fromArray(skeleton.world[bone]!)); } } });
  owned.push(() => grenades.dispose());
  const offActionEnd = walk.onActionEnd(end => { if (throwPoseEnds(end)) grenades.noteHoldEnd(end.reason); });
  owned.push(offActionEnd);
  grenades.spawn();
  // The START menu (ABORT back to the lobby) and the R2 inventory, the production modules on this kit (`./walkingMenus`).
  // Declared before the menus: their mount asks whether the Chat menu is open.
  let talk: WalkingTalk | null = null;
  // XBOX-ARMORY (a contribution): WEAPON EXCHANGE, R2 while dead, over this runtime's client (`./walkingExchange`).
  const exchange = online && hud && !extras.without?.menus ? walkingExchange({ map, client: () => client, alive: () => !walk.isDead() && !(match?.ghost() ?? false),
    walking: () => walk.mode() === 'walk', win: window }) : null;
  if (exchange) owned.push(() => exchange.dispose());
  const menus: WalkingMenus | null = hud && !extras.without?.menus ? walkingMenus({ hud, table: map.arsenal?.table ?? null, loadout: () => kitFor(client?.id ?? 0, client?.team ?? null),
    walking: () => walk.mode() === 'walk', alive: () => !walk.isDead(), inMatch: () => !online || client?.state === 'open', spectator: () => !!client && client.role !== 'player',
    firearm: { kitChangeGate: () => combat.kitChangeGate(), select: item => { const taken = combat.select(item); return taken !== false; }, hand: () => combat.state().weapon,
      records: () => combat.records(), magazineOf: record => combat.fire.magazineOf(record) },
    items: grenades.kit, options: extras.startMenuOptions, caption: id => extras.captions?.()?.[String(id)] ?? null, title: () => extras.title ?? null,
    sound: name => { sound?.audio.play(name, null); },
    otherMenu: () => talk?.isOpen() ?? false, opened: () => { talk?.reset(); }, voiceMask: on => { talk?.setVoiceMask(on); },
    ...(exchange ? { exchange: exchange.exchange } : {}) }) : null;
  if (menus) owned.push(() => menus.dispose());
  // The Chat menu and the voice chat, the production parts over this runtime's client (`./walkingTalk`).
  let scoreRows: readonly ScoreRow[] = [], spectatorCount = 0;
  talk = hud && !extras.without?.talk ? walkingTalk({ hud, client: () => client, audio: () => sound?.audio ?? null, rows: () => scoreRows, spectators: () => spectatorCount,
    alive: () => !walk.isDead(), screenUp: () => match?.screenUp() ?? false, side: () => client?.team === 'terrorist' ? 'terrorist' : 'seal', character: () => 0,
    custom: () => extras.taunts?.() ?? [], messages: () => extras.messages?.() ?? [], talk: extras.talk,
    otherMenu: () => !!menus?.inventory.isOpen() || !!menus?.startMenu.isOpen(), release: () => { grenades.cancelHold(); combat.trigger(false); },
    runAndTalk: () => menus?.startMenu.runAndTalk() ?? false, aborting: () => menus?.aborting() ?? false,
    feetOf: id => frame.others.find(actor => actor.id === id)?.position ?? null, ownFeet: () => walk.feet(),
    without: { voice: extras.without?.voice, hud: extras.without?.voiceHud, permissionAsk: extras.without?.voicePermission } }) : null;
  if (talk) { const mounted = talk; owned.push(() => mounted.dispose()); menus?.setOverlayPart((size, sizes) => mounted.draw(size, sizes)); }
  const drawnObjects: SceneObject[] = []; frame.objects = drawnObjects;
  const objectiveKey = (event: KeyboardEvent) => objectives.key(event);
  const cancelObjectives = () => objectives.cancel();
  canvas.addEventListener('keydown', objectiveKey); canvas.addEventListener('keyup', objectiveKey);
  canvas.addEventListener('blur', cancelObjectives); window.addEventListener('blur', cancelObjectives);
  const unbindObjectives = () => {
    canvas.removeEventListener('keydown', objectiveKey); canvas.removeEventListener('keyup', objectiveKey);
    canvas.removeEventListener('blur', cancelObjectives); window.removeEventListener('blur', cancelObjectives);
  };
  owned.push(unbindObjectives);
  // N-28: the window or the page come back -> the canvas takes its keys again (the mount's `canvas.focus()`,
  // `./matchLoader`), unless another element took focus on purpose.
  const refocus = () => { if (!document.hidden && (!document.activeElement || document.activeElement === document.body)) canvas.focus(); };
  window.addEventListener('focus', refocus); document.addEventListener('visibilitychange', refocus);
  owned.push(() => { window.removeEventListener('focus', refocus); document.removeEventListener('visibilitychange', refocus); });
  const matchKey = (event: KeyboardEvent) => match?.key(event, document.activeElement !== canvas || !document.hasFocus());
  canvas.addEventListener('keydown', matchKey); canvas.addEventListener('keyup', matchKey);
  owned.push(() => { canvas.removeEventListener('keydown', matchKey); canvas.removeEventListener('keyup', matchKey); });
  const ownBody = () => {
    const next = client ? remotes.modelOf(client.id) : 0;   // the page's own type, as the room rebuilt its body (`spawn.char`)
    if (next !== localModel) {
      localModel = next; localPlay.setBody(localViews[next]!, models[next]!); combat.hang();
    }
  };
  const offPlayEvent = localPlay.onEvent(event => sound?.playEvent(event));
  owned.push(offPlayEvent);
  if (online) {
    const adopted = online.adopt ?? null;
    if (adopted) { client = adopted.client; client.rebind(walk); }
    else client = new NetClient({ ...online, armory: false }, walk);
    world.follow();
    owned.push(() => { if (!adopted) client?.close(); });   // a failed mount never closes the lobby's client
    const applySpawn = (event: Extract<ServerEvent, { type: 'spawn' }>) => {
      ownBody(); inputCombat.suspend(); combat.spawn(); grenades.spawn(); exchange?.spawned();
      match?.event(event, performance.now()); panel?.event(event, performance.now());
    };
    offHeld = client.onSpawnHeld(() => {
      const event = heldSpawn; heldSpawn = null; if (event) applySpawn(event);
    });
    owned.push(() => offHeld?.());
    const hear = (event: ServerEvent) => {
      let deferSpawn = false;
      if (event.type === 'welcome') {
        heldSpawn = null;
        teams.clear(); kits.clear(); for (const player of event.players) { teams.set(player.id, player.team); setKit(player.id, player.kit); }
        if (client?.role !== 'player') connectionError = 'This experiment requires a player seat';
        if (event.map !== online.map) connectionError = 'The server map differs from the loaded experiment map';
        ownBody(); combat.spawn(); grenades.spawn();
      } else if (event.type === 'joined') teams.set(event.id, event.team);
      else if (event.type === 'left') { teams.delete(event.id); kits.delete(event.id); }
      else if (event.type === 'gameLobby') { for (const seat of event.seats) if (seat.team) teams.set(seat.id, seat.team); }
      else if (event.type === 'spawn') {
        setKit(event.id, event.kit);
        if (event.id === client?.id) {
          deferSpawn = client.spawnPending();
          if (deferSpawn) heldSpawn = event;
          else { heldSpawn = null; ownBody(); inputCombat.suspend(); combat.spawn(); grenades.spawn(); exchange?.spawned(); }
        }
      }
      else if (event.type === 'kit') { setKit(client!.id, event.loadout); grenades.kitChanged(); }
      else if (event.type === 'taken') setKit(event.by, event.kit);
      else if (event.type === 'resume') {
        heldSpawn = null;
        setKit(event.id, event.loadout);
        if (event.id === client?.id) connectionError = 'Resuming an existing combat seat is not supported by this experiment yet';
      }
      exchange?.event(event);   // XBOX-ARMORY: the room's held kit, its answers, the own spawn
      if (connectionError) lobby?.fail(connectionError);
      else lobby?.event(event);
      if (deferSpawn) return;
      combat.event(event);
      if (event.type === 'kill' && event.victim === client?.id) hands.pose.cut();
      remotes.event(event);
      grenades.event(event);
      talk?.event(event);
      if (event.type === 'score') { scoreRows = event.rows; spectatorCount = event.spectators.length; }
      match?.event(event, performance.now());
      if (event.type === 'welcome' || event.type === 'roundStart') tracerRounds.clear();
      if (event.type === 'blast' && event.flash && !(blind.level !== null && blind.level > event.flash)) { blind.level = event.flash; blind.t = 0; blind.started++; }
      if (event.type === 'roundStart' || (event.type === 'spawn' && event.id === client?.id)) blind.level = null;   // `../matchThrow`: the wash stops with the round
      if (event.type === 'roundStart') menus?.roundStart();
      if (event.type === 'spawn' && event.id === client?.id) menus?.spawned(false);
      if (event.type === 'roundStart') effects?.clearRound();   // ROUND_END_EFFECTS_READING, run at the next round's start (`../matchThrow`)
      if (effects && (event.type === 'shot' || event.type === 'impact') && (event.id === client?.id) === (event.type === 'impact')) {
        // `../netPage`: another's round -- its muzzle, tracer and impact -- or the page's own round a body stopped: the impact alone.
        const record = map.arsenal?.table?.records.get(event.weapon);
        if (record && !document.hidden) {
          const count = (tracerRounds.get(event.id) ?? 0) + 1; tracerRounds.set(event.id, count);
          const mine = client?.role === 'player' ? client.team : null, theirs = teams.get(event.id) ?? null;
          const shot: Extract<FireEvent, { type: 'round' }> = { type: 'round', weapon: fireWeaponOf(record), from: event.from, to: event.to,
            hit: event.normal !== null, rounds: 0, normal: event.normal, material: event.material,
            ...(event.type === 'shot' && tracerRound(event.weapon, count) ? { tracer: true as const, tracerKind: tracerKindFor(event.weapon, mine !== null && theirs === mine) } : {}),
            ...(event.type === 'shot' && event.end ? { tracerTo: event.end } : {}) };
          if (event.type === 'impact') effects.onRound(shot, null, false);
          else {
            const held = remotes.weaponFrame(event.id), id = event.id;
            effects.onRound(shot, held ? { node: weaponNode(() => frame.others.find(actor => actor.id === id), held.object), muzzle: held.muzzle } : null, false);
            for (const t of event.through ?? []) effects.onRound({ ...shot, to: t.point, normal: t.normal, material: t.material, hit: true, tracer: undefined, tracerKind: undefined }, null, false);
          }
        }
      }
      if (event.type === 'shot' && event.id !== client?.id) {
        const record = map.arsenal?.table?.records.get(event.weapon);
        if (record) sound?.roundFired({ weapon: record, from: event.from });
        const actor = walk.feet(); if (actor) sound?.roundPast(event.from, event.end ?? event.to, actor);
      } else if (event.type === 'reloadSound' && event.id !== client?.id) {
        const record = map.arsenal?.table?.records.get(event.weapon);
        if (record) sound?.reloadSound(record, event.at);
      }
      panel?.event(event, performance.now());
    };
    offEvents = client.on(hear);
    owned.push(() => offEvents?.());
    // The lobby's events first, the welcome among them, in the order the room sent them (NetPage's `game.adopt`).
    if (adopted) for (const event of adopted.events) hear(event);
    // Runtime welcome clears remote rigs first. BombPage then applies the
    // welcome's carrier gear, including peers whose first pose is still pending.
    objectives.follow();
  }
  // Same capture-phase goodbye as NetPage: notify the room before page-level teardown closes the socket.
  const leave = () => client?.sayBye(); window.addEventListener('pagehide', leave, true);
  owned.push(() => window.removeEventListener('pagehide', leave, true));
  let seconds = 0, hadController = false, hiddenWas = false;
  /** An instrument's clock: where a frame's step goes, milliseconds summed (the report divides by the frames). */
  const cost = { frames: 0, step: 0, effects: 0, grenades: 0, remotes: 0, effectsMax: 0, stepMax: 0, laps: {} as Record<string, number> };
  let lapAt = 0;
  const lap = (name: string): void => { const now = performance.now(); cost.laps[name] = (cost.laps[name] ?? 0) + now - lapAt; lapAt = now; };
  let reticleHand: { id: number; set: number } | null = null;
  return {
    fly, walk, frame, play: localPlay,
    client: () => client,
    setGearVisible,
    setSound(next: WalkingSound | null) { sound = next; match?.setSound(next); },
    loaded() { if (lobby) lobby.rendered(); else client?.reportLoaded(); },
    /**
     * The match's end under the real front end: the client handed back to the game's lobby, open and unclosed, this
     * runtime's listeners off it and its world let go (the lobby rebinds its own idle walk, `GameSocketHost.adopt`).
     * Null when there is none to give back. `dispose` afterwards closes nothing.
     */
    release(): NetClient | null {
      if (released || disposed) return null;
      released = true; offEvents?.(); offEvents = null; offHeld?.(); offHeld = null; heldSpawn = null;
      world.dispose();
      const given = client; client = null;
      window.removeEventListener('pagehide', leave, true);
      if (!given || given.state !== 'open') { given?.close(); return null; }
      return given;
    },
    ready() { return lobby?.ready() ?? false; },
    switchTeams() { return lobby?.switchTeams() ?? false; },
    motion() { return { ...motion }; },
    /** An instrument's read of the throwables. */
    /** The START menu's ABORT run out (`../matchAbort`): the dialog's id for the page to leave the match on, else null. */
    aborted(): number | null { return menus?.aborted() ?? null; },
    /** An instrument's read of where the frames' steps went (milliseconds summed, by stage). */
    costStats() { return { frames: cost.frames, step: cost.step, laps: { ...cost.laps } }; },
    dropVoice() { talk?.dropVoice(); }, dropTalk() { talk?.dispose(); talk = null; },
    menuStats() { return menus?.report() ?? null; }, talkStats() { return talk?.report() ?? null; }, abortNow() { menus?.abortNow(); },
    grenadeStats() { return { ...grenades.report(), blinds: blind.started }; },
    /** A test's hook: the blind as the room's `blast` starts it. */
    blindNow(level: 1 | 2 | 3) { blind.level = level; blind.t = 0; blind.started++; },
    /** An instrument's read: particles emitted so far, null without effect data. */
    effectsEmitted() { return effects ? effects.stats().emitted : null; },
    report() { const snapshot = walk.snapshot(), aim = walk.fireAim(), worldReport = world.report(); return { state: client?.state ?? 'offline', error: connectionError || client?.refusal?.reason || '', locked: walk.isLocked(),
      velocity: snapshot ? [snapshot.vx, snapshot.vy, snapshot.vz] : [0, 0, 0],
      id: client?.id ?? 0, feet: [...frame.body.position], players: 1 + frame.others.length, lobby: lobby?.report() ?? null,
      others: frame.others.map(actor => ({ id: actor.id, feet: [...actor.position], neck: remotes.targets.node(actor.id, 'neck'), muzzle: remotes.muzzle(actor.id) })), hud: panel?.report(), reticle: frame.reticle,
      aim: aim ? { eye: [...aim.eye], far: [...aim.far] } : null,
      view: { yaw: fly.pose().yaw, pitch: fly.pose().pitch },
      combat: { ...combat.report(), enemiesIdentified: perception.count() }, remote: remotes.report(), match: match?.report(),
      hands: hands.pose.stats(), objectives: objectives.report(), effects: effects?.stats() ?? null, grenades: grenades.report(), menus: menus?.report() ?? null, talk: talk?.report() ?? null, cost: { ...cost, laps: { ...cost.laps } },
      world: { ...worldReport, actionOwner: 'objectives',
        unsupported: worldReport.unsupported.filter(item => item !== 'equipment and objective actions') } }; },
    step(dt: number, now: number, real = dt): SceneFrame {
      if (disposed) throw new Error('Movement runtime disposed');
      const stepStarted = performance.now(); lapAt = stepStarted;
      if (client) lobby?.connection(client.state, client.closeCode);
      if (connectionError) throw new Error(connectionError);
      // The screen delay can expire between frames; update this before any
      // pose/world callback, rather than using last frame's sound gate.
      sound?.screen(match?.screenUp() ?? false);
      const controller = document.hidden ? null : pad.poll(navigator);   // N-28: not gated on the canvas's focus
      padReads = controller !== null;
      const active = canvasFocused() || padReads;
      fly.setInputSuspended(!active || !!menus?.startMenu.isOpen() || (!!talk?.isOpen() && !talk.walking())); walk.holdForMenu(!active);
      // A lost physical poll cancels the held Action. It is never a release that
      // can open or kick a door (since N-28 a focus change inside this window drops no poll; a hidden page does).
      const lostController = hadController && !controller;
      if (lostController) { objectives.cancel(); inputCombat.suspend(); walk.stanceTouch('cancel'); }
      hadController = controller !== null;
      const polled = padInput(controller);
      // The START menu, then the R2 inventory, before the game's lanes (`../matchMount`'s order): `input` is what they leave the game.
      const menu = menus ? menus.pad(padButtonsDown(controller), polled, before, dt, real, talk ? (held, lanes) => talk!.pad(held, lanes, active) : undefined) : null;
      const input = menu ? menu.input : polled;
      match?.input(input, !active);
      fly.setStick(input.moveX, input.moveY); fly.setLook(input.lookX, input.lookY);
      // Without the menus (no HUD): R2 steps to the kit's next item a press (`./walkingGrenades` `cycle`).
      if (!menus && polled.inventory && !before.inventory && enabled()) grenades.cycle();
      if (input.jump && !beforeGame.jump) walk.jumpPress();
      if (!input.crouch && beforeGame.crouch && active && !lostController) walk.crouch();
      if (input.stance !== beforeGame.stance) walk.stanceTouch(active && !lostController ? (input.stance ? 'down' : 'up') : 'cancel');
      before = polled; beforeGame = input;
      objectives.input(input, real); lap('input');
      inputCombat.frame(input, enabled(), real, controller !== null); combat.beforeMove(); fly.update(dt); walk.frame(dt);
      objectives.endFrame(); lap('walk');
      ownBody(); combat.poseFrame(dt); hands.frame(dt); localPlay.frame(dt, walk, fly.camera, real,
        match ? corpseShownS(match.rules(), 'own', match.waiting()) : Infinity, match?.ghost() ?? false);
      lap('ownPose');
      frame.body.visible = localViews[localModel]!.group.visible;
      if (frame.reticle && (!enabled() || !walk.snapshot())) frame.reticle.visible = false;
      const own = walk.snapshot();
      if (own) {
        const feet = own.drawnFeet ?? own.feet;
        motion.frame++; motion.x = feet[0]; motion.y = feet[1]; motion.z = feet[2]; motion.vx = own.vx; motion.vz = own.vz;
        const view = localViews[localModel]!;
        frame.body = { id: client?.id ?? 0, modelIndex: localModel, position: own.drawnFeet ?? own.feet, yawRadians: own.yaw * Math.PI / 180,
          visible: view.group.visible, palette: view.palette, local: view.skeleton.local, world: view.skeleton.world,
          held: combat.held(), gear: view.gearVisibility() };
      }
      { const t0 = performance.now(); frame.others = remotes.frame(dt, client?.bodies(now) ?? [], fly.camera, own?.feet ?? null, real); cost.remotes += performance.now() - t0; }
      // Production matchMount order: remote pose, door/world updates, then fire.
      lap('remotes'); world.step(dt); lap('world');
      triggerOwner.handOver(enabled() && walk.mode() === 'walk' && !walk.isDead());
      combat.fireFrame(dt); lap('fire');
      if (own) {
        panel?.equipment(grenades.box()); panel?.combat(combat.state()); panel?.frame(own, now, input.scoreboard);
        const { record, mode } = combat.selected(), accuracy = combat.accuracy, zoom = combat.zoom;
        const aim = walk.aim(); fly.camera.updateMatrixWorld();
        const projected = aim ? aimPoint(fly.camera, aim) : [0.5, 0.5], shift = fly.screenShift();
        const set = handReticleType(null, record.id, zoom.state(), zoom.target(), mode);
        // MatchFirearm's selected-hand/set transition: the shared accuracy owns
        // the exertion change, after this frame's firearm work.
        if (reticleHand && reticleHand.id !== record.id && reticleHand.set !== set) accuracy.reticleSetChanged();
        reticleHand = { id: record.id, set };
        const reticleMode = zoom.binoculars() ? 'binoculars' : zoom.view() === 'scope' ? 'scope' : 'reticle';
        frame.reticle = { ...accuracy.reticle(zoom.state()), set, aim: [projected[0]! - shift[0], projected[1]! - shift[1]],
          mode: reticleMode, night: zoom.view() === 'nightvision', scopeBitmaps: scopeBitmaps(record.id),
          visible: !!aim && !!panel?.visible() && !input.scoreboard && enabled() && (reticleMode !== 'reticle' || [0, 1, 2].includes(set)) };
      }
      hud?.setZoom(combat.zoom.hudZoom(), combat.zoom.binoculars()); lap('hud');
      perception.frame(dt); lap('perception');
      match?.frame(dt, now);
      objectives.frame(); lap('match');
      { const t0 = performance.now(); grenades.frame(dt, real); cost.grenades += performance.now() - t0; }
      if (talk) { talk.setData(extras.soundData?.() ?? null); talk.frame(now); }
      drawnObjects.length = 0; for (const object of objectives.objects) drawnObjects.push(object); for (const object of grenades.objects) drawnObjects.push(object);
      // PAR-34: the blind runs in real time.
      if (blind.level !== null) { blind.t += real; if (blind.t > Math.max(BLIND_KEYS[blind.level].at(-1)!.t, glowLength(blind.level))) blind.level = null; }
      frame.wash = blind.level === null ? null : blindWash(blind.level, blind.t);
      frame.glow = blind.level === null ? null : blindGlow(blind.level, blind.t);
      seconds += dt; frame.seconds = seconds; frame.deltaSeconds = dt;
      const renderView = combat.zoom.renderView(); frame.magnification = renderView.magnification; frame.farExtra = renderView.farExtra;
      fly.camera.updateMatrixWorld(); lap('grenades');
      if (hud) {
        // XBOX-TAGS-FEED (OT.R148): `../matchMount`'s tag line -- the standard input builder over the fork's seat, rows,
        // names, sides, heads and voice; no region gate here (the fork draws every zone), so every zone counts as drawn.
        const named = match;
        hud.setTeamTags(client && named ? teamTags({ ...teamTagInput({ client, rows: scoreRows, nameOf: id => named.nameOf(id), isBot: id => named.isBot(id) },
          { headAt: id => remotes.headAt(id), deathAge: id => remotes.deathAge(id), teamOf: id => teams.get(id) ?? null },
          fly.camera, talk?.report().voice ?? { holder: null }), original: hud.teammateNamesOriginal() }) : null);
      }
      // After the fire (`../matchMount`'s order): the runs' ticks, then the particles' geometry for this frame's camera.
      if (effects) { if (hiddenWas && !document.hidden) effects.retireRounds(); hiddenWas = document.hidden;
        const t0 = performance.now(); effects.update(dt, fly.camera, meshes => grenades.writeArc(meshes, fly.camera as PerspectiveCamera));
        const spent = performance.now() - t0; cost.effects += spent; cost.effectsMax = Math.max(cost.effectsMax, spent); }
      lap('effects'); sound?.frame(fly.camera, match?.following() ? null : walk.gameCamera()); sound?.audio.pump(); lap('sound');
      { const spent = performance.now() - stepStarted; cost.frames++; cost.step += spent; cost.stepMax = Math.max(cost.stepMax, spent); }
      return frame;
    },
    dispose() {
      if (disposed) return; disposed = true;
      // The client's and the walk's hold on this runtime let go (a closed client is still an object someone may hold).
      offEvents?.(); offEvents = null; offHeld?.(); offHeld = null; offActionEnd(); offPlayEvent();
      unbindCombat(); combat.dispose(); match?.dispose(); heldSpawn = null;
      unbindObjectives(); objectives.dispose(); hands.dispose(); world.dispose();
      talk?.dispose(); menus?.dispose(); grenades.dispose(); effects?.dispose(); frame.particles = undefined; frame.effectMeshes = undefined; frame.objects = undefined;
      canvas.removeEventListener('keydown', matchKey); canvas.removeEventListener('keyup', matchKey);
      localPlay.setBody(null, null); localPlay.setClips(null);
      window.removeEventListener('pagehide', leave, true); client?.close(); client = null; remotes.dispose(); perception.clear(); kits.clear(); sound = null;
      walk.unbindKey(); fly.dispose(); canvas.removeEventListener('pointerdown', focus);
      window.removeEventListener('focus', refocus); document.removeEventListener('visibilitychange', refocus);   // N-28 (`owned` runs only on a failed mount)
    },
  };
}
