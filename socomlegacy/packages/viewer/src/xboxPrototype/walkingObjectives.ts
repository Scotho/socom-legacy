import { surfaceMaterial } from '@s2u/scene';
import { ActionSelection, isHoldContext, type CancelCause } from '../actionContext';
import { ActionPage, type ActionTarget } from '../actionPage';
import { actionInputs, actionPromptOf, ActionWiring, observeCommands, RoomEvents } from '../actionWiring';
import { BombPage, ownBombBody, worldPulse } from '../bombPage';
import { actionRayPick } from '../equipment';
import { noInput, type Input } from '../gamepad';
import type { ActionEntry } from '../hud';
import type { PlayData } from '../motionTable';
import type { NetClient } from '../net/client';
import { Button, type Command, type Team } from '../net/protocol';
import type { ThrowPose } from '../throwPose';
import { TraversalPage } from '../traversalPage';
import type { WalkMode } from '../walk';
import { bombModelFrame } from './objectiveFrame';
import type { PrototypeHud } from './sceneFrame';
import type { WalkingSound } from './sound';
import type { walkingWorld } from './walkingWorld';

export interface WalkingObjectivesDeps {
  walk: WalkMode;
  world: Pick<ReturnType<typeof walkingWorld>, 'world' | 'doors' | 'gates' | 'supportsSwitch' | 'setActionPressure'>;
  /** One shared pose, mounted/stepped/cut by the runtime as in MatchThrow;
   * later equipment uses this same layer, never another independent one. */
  hands: Pick<ThrowPose, 'start'>;
  pistol(): boolean;
  clips: PlayData | null;
  client(): NetClient | null;
  enabled(): boolean;
  /** walkingMatch owns this dead controller's presses, including keyboard X. */
  respawnInputActive(): boolean;
  sound(): WalkingSound | null;
  hud?: PrototypeHud;
  setGearVisible(id: number, name: string, on: boolean): void;
  teamOf(id: number): Team | null;
  /** Current drawn body feet, the own walk or a remote body, never a guessed spawn. */
  bodyAt(id: number): readonly [number, number, number] | null;
}

/** Small render/input adapter over the production objective and traversal rules.
 * Construct BEFORE NetClient installs the real command tap. Call follow AFTER
 * the runtime's listener is registered, so its welcome clears remote rigs before
 * BombPage applies carrier gear. Only the actual command's ActionHeld reaches
 * BombPage.tick; Traversal owns that bit through WalkMode, as in matchActions.
 * No bomb clock, eligibility or placement rule is implemented here.
 *
 * Mounting this replaces walkingWorld's door-only input/key/cancel calls. The
 * world still owns DoorPage/WorldState and the renderer still owns all geometry.
 * Plant/defuse/drop, doors, supported switches and traversal are mounted; other action contexts,
 * explosion particles and water particles remain explicitly unmounted.
 * This adapter's lifetime is one loaded map; follow is subscription ownership,
 * not support for seamless map changes or resuming an existing combat seat.
 */
export function walkingObjectives(d: WalkingObjectivesDeps) {
  const events = new RoomEvents(), object = bombModelFrame(), selection = new ActionSelection();
  const traversal = new TraversalPage(d.walk, {
    slide: at => d.sound()?.ladderSlide(at), land: (speed, at) => d.sound()?.ladderLand(speed, at),
  });
  traversal.setClips(d.clips);
  d.world.setActionPressure(() => traversal.actionPress());
  let disposed = false, missingExplosions = 0;
  let lastCommand: Omit<Command, 'seq'> | null = null;
  const openClient = () => { const client = d.client(); return client?.state === 'open' ? client : null; };
  const actions = new ActionPage({ world: d.world.world, feet: () => d.walk.feet(), aim: () => d.walk.lookAim(), net: openClient,
    gatePress: (action, seq) => d.world.gates.press(action, seq) });
  const supported = (target: ActionTarget | null) => target !== null && d.world.supportsSwitch(target.record.valve);
  let shownSwitchSupported = false;
  const switchArmed = () => {
    const target = actions.target();
    return target ? supported(target) : shownSwitchSupported && actions.armed();
  };
  const offActions = events.on(event => {
    // This experimental backend cannot yet present a moving crane. Keep that
    // context unavailable rather than sending a control with no visible result.
    if (event.type === 'action') {
      const record = d.world.world()?.meta.actions[event.action];
      if (record && !d.world.supportsSwitch(record.valve)) return;
    }
    actions.event(event);
  });
  const bomb = new BombPage(events, {
    id: () => d.client()?.role === 'player' ? d.client()!.id : null,
    team: () => d.client()?.role === 'player' ? d.client()!.team : null,
    alive: () => d.walk.mode() === 'walk' && !d.walk.isDead(), feet: () => d.walk.feet(),
    actions: () => d.world.world()?.meta.actions ?? [],
    look: () => lastCommand, serverTick: () => d.client()?.serverTick() ?? 0,
    teamOf: d.teamOf, bodyAt: d.bodyAt, open: () => d.client()?.state === 'open',
    gateShut: () => d.walk.actionGateShut(),
    // Identical plant-aim source to MatchActions (research 214, PLANT-AIM).
    pick: () => {
      const world = d.world.world(), aim = d.walk.lookAim(); if (!world || !aim) return null;
      const pick = actionRayPick(world.grid, aim.eye, aim.far, world.meta.actions, node => surfaceMaterial(node, ''));
      return pick && { path: pick.path, point: pick.point, eye: [aim.eye[0]!, aim.eye[1]!, aim.eye[2]!] };
    },
    body: () => lastCommand ? { yaw: lastCommand.yaw, posture: d.walk.posture() } : null,
    aim: claim => {
      const client = openClient();
      if (client?.role === 'player') client.send({ type: 'bombAction', seq: client.lastSeq(), action: 'aim', surface: claim?.surface ?? null,
        ...(claim?.eye ? { eye: claim.eye } : {}) });
    },
  }, {
    hud: d.hud, worldBomb: object, pulse: worldPulse(d.world.world),
    remotePlayers: { setGearVisible: d.setGearVisible },
    // The runtime updates every cached own team rig as well as the active Play.
    // Its offline own frame id is 0; this is render ownership, never a wire id.
    ownBody: ownBombBody({ setGearVisible: (name, on) => d.setGearVisible(d.client()?.id ?? 0, name, on) }, d.hands, d.walk, d.pistol),
    roundAudio: { bomb: (...args) => d.sound()?.roundAudio.bomb(...args) },
    sound: { play: (name, at) => { d.sound()?.audio.play(name, at, 'play', 1); } }, // bombSound, pickup gain 1.0
    effects: { play: () => { missingExplosions++; return false; } },
  });
  const originalTap = d.walk.setNetTap;
  observeCommands<Omit<Command, 'seq'>, [number, number, number]>(d.walk, command => {
    if (disposed) return;
    lastCommand = command; bomb.tick((command.buttons & Button.ActionHeld) !== 0);
  });
  const observedTap = d.walk.setNetTap;
  const canAct = () => !disposed && d.enabled() && d.walk.mode() === 'walk' && !d.walk.isDead() && !d.walk.isLocked();
  const pick = () => selection.pick(actionInputs({
    canAct, mounted: () => false, locked: () => d.walk.isLocked(), gateShut: () => d.walk.actionGateShut(),
    door: () => d.world.doors.target() !== null, bombPrompt: () => bomb.prompt(),
    traversal: () => traversal.hudClimb()?.visible === true || traversal.traversal()?.state().kind === 'ladder',
    switch: switchArmed, c4: () => false, turret: () => false,
  }));
  const wiring = new ActionWiring({ pick, cancel: () => traversal.cancelAction(), fire: {
    door: () => d.world.doors.action(), switch: () => supported(actions.target()) && actions.action(), c4: () => false, turret: () => false,
    bombDrop: () => {
      const client = openClient(); if (client?.role !== 'player') return false;
      client.send({ type: 'bombAction', seq: client.lastSeq(), action: 'drop' }); return true;
    },
  } });
  traversal.holdAllowed = () => { const context = pick(); return context === null || context === 'traversal' || isHoldContext(context); };
  // The shared dead path is deliberately not wired a second time here.
  d.walk.setActionFilter(() => canAct() ? wiring.filter() : true);
  let pad = noInput(), previous = noInput(), keyHeld = false, keyIgnored = false, blocked = false;
  const keys = new Set<string>();
  const cancel = (cause: CancelCause = 'blur') => {
    blocked = blocked || pad.action; keyHeld = false; keyIgnored = false; keys.clear();
    wiring.cancel(cause);
    // Neutralize the traversal lanes without presenting a physical release.
    traversal.padLanes(noInput(), noInput()); traversal.input(); previous = noInput();
  };
  const drive = (dt: number) => {
    const after = { ...pad, action: pad.action || keyHeld,
      leanLeft: pad.leanLeft || keys.has('KeyQ'), leanRight: pad.leanRight || keys.has('KeyE') };
    // MatchActions chases before firing a context, except on the respawn route.
    if (!d.respawnInputActive()) traversal.chaseAction(after.action, dt);
    if (!canAct()) return;
    if (blocked) { if (!after.action) blocked = false; return; }
    if (after.action && !previous.action) wiring.press();
    else if (!after.action && previous.action) wiring.release();
    wiring.hold(dt);
    const head = pick(), sides = selection.pad(after.action, after.leanLeft, after.leanRight);
    if (after.action && pick() !== head) wiring.lifecycle.reselect();
    traversal.padLanes(previous, { ...after, leanLeft: sides.left, leanRight: sides.right }); traversal.input();
    previous = after;
  };
  return { objects: object.objects,
    follow() {
      const client = d.client(); if (events.following() === client) return;
      cancel('loading'); lastCommand = null; selection.reset(); events.follow(client);
      actions.sample(false); shownSwitchSupported = false;
    },
    input(next: Input, dt: number) {
      // Cancel BEFORE an inactive poll replaces the last physical pad level.
      // The latch survives repeated empty polls until a focused release.
      const active = canAct();
      if (!active) cancel(d.walk.isDead() ? 'death' : 'loading');
      pad = next; if (!active && pad.action) blocked = true; drive(dt);
    },
    key(event: KeyboardEvent) {
      if (!['KeyX', 'KeyQ', 'KeyE'].includes(event.code)) return;
      if (event.type === 'keydown') {
        if (event.repeat) return;
        if (event.ctrlKey || event.altKey || event.metaKey || !canAct()) { if (event.code === 'KeyX') keyIgnored = true; return; }
        if (event.code === 'KeyX') { if (keyIgnored || keyHeld) return; keyHeld = true; } else keys.add(event.code);
      } else if (event.type === 'keyup') {
        keys.delete(event.code);
        if (event.code === 'KeyX') { const ignored = keyIgnored; keyHeld = false; keyIgnored = false; if (ignored) return; }
        if (!canAct()) { cancel(d.walk.isDead() ? 'death' : 'loading'); return; }
      } else return;
      drive(0);
    },
    cancel,
    frame() {
      if (disposed) return;
      bomb.hudFrame(); traversal.soundFrame();
      // MatchActions.prompt samples the optical ray before building the action
      // list; ActionPage still re-picks on release (FUN_00592d50, research 213).
      actions.sample(canAct()); shownSwitchSupported = canAct() && supported(actions.target());
      if (!d.hud) return;
      const context = pick(), entries: ActionEntry[] = [];
      if (context !== null) for (const selected of selection.list()) {
        const prompt = selected === 'traversal' ? (traversal.traversal()?.state().kind === 'ladder' ? 'ladder_slide' : 'climb')
          : actionPromptOf(selected, { switch: () => shownSwitchSupported ? actions.shownPrompt() : null, turret: () => null });
        if (prompt) entries.push({ prompt });
      }
      d.hud.setAction(null); // The shared list, including traversal, owns its head.
      d.hud.setClimbPrompt(traversal.hudClimb()); d.hud.setNearbyAction(entries.length ? entries : null);
    },
    endFrame() { wiring.endFrame(); },
    report() { return { bomb: bomb.state(), hold: bomb.holdProgress(), context: pick(), traversal: traversal.stats(), switches: actions.stats(),
      missingExplosions, unsupported: ['bomb explosion and traversal water particles', 'crane controls, C4, turrets, pickups, hostages and victory actions'] }; },
    dispose() {
      if (disposed) return;
      cancel('loading'); events.follow(null); offActions(); bomb.dispose(); object.place(null); disposed = true;
      d.sound()?.ladderSlide(null); d.world.setActionPressure(null); traversal.setEffects(null);
      d.walk.setActionFilter(null); d.walk.useTraversal(null);
      if (d.walk.setNetTap === observedTap) { d.walk.setNetTap(null); d.walk.setNetTap = originalTap; }
      d.hud?.setExtraMarks([]); d.hud?.setHoldBar(null); d.hud?.setDefuseTimer(null); d.hud?.setBombCarrier(null);
      d.hud?.setNearbyAction(null); d.hud?.setClimbPrompt(null); d.hud?.setAction(null);
    },
  };
}
