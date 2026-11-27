import { ActionLifecycle } from '../actionContext';
import { ActionPressure } from '../actionPressure';
import { DoorPage } from '../doorPage';
import { GatePage } from '../gatePage';
import type { LoadedMap } from '../loadMap';
import type { NetClient } from '../net/client';
import type { WalkMode } from '../walk';
import { bareMeta, WorldState } from '../worldState';
import type { WalkingSound } from './sound';
import { worldFrame } from './worldFrame';

export interface WalkingWorldDeps {
  map: Pick<LoadedMap, 'ground' | 'meta' | 'doors' | 'gates'> & { craneValves?: readonly string[] };
  walk: Pick<WalkMode, 'gridOfGround' | 'grid' | 'feet' | 'fireAim' | 'mode' | 'isDead' | 'isLocked' | 'actionGateShut'>;
  client(): NetClient | null;
  enabled(): boolean;
  /** The shared match's actual respawn-dead controller owns Action before it is ready. */
  respawnInputActive?(): boolean;
  sound(): WalkingSound | null;
}

/** Experimental render adapter, not a second world simulation. DoorPage owns
 * server door reconciliation, open/kick prediction and reset (research 92).
 * GatePage follows the actual DoorWire tail and its acknowledgement/room tick
 * (research 174 section 5, 175 section 5.3, GATE_PREDICT_ADAPTATION).
 * WorldState owns the environment and scene programs (research 209). These use
 * the walk's existing hull/grid; NetClient applies its environment before replay.
 * Renderer callbacks carry numbers only. Scene particles/common effects and
 * the remaining action contexts are explicitly still unmounted.
 */
export function walkingWorld(d: WalkingWorldDeps) {
  const state = worldFrame(), pressure = new ActionPressure();
  let actionPressure: (() => number) | null = null;
  const omitted = { particles: 0, destruction: 0, commonEffects: 0 };
  const grid = d.walk.gridOfGround();
  const world = d.map.ground && grid ? new WorldState(d.map.meta ?? bareMeta(), d.map.ground, grid, {
    visible: state.visible, opacity: state.opacity, scroll: state.scroll,
    sound: (name, _path, volume, at) => { d.sound()?.sceneSound(name, at, volume); },
    particles: () => { omitted.particles++; }, destruction: () => { omitted.destruction++; }, call: () => { omitted.commonEffects++; },
  }) : null;
  if (world) { world.runAutostartPrograms = true; world.applyInitial(); }
  const doors = new DoorPage({ grid: () => d.walk.grid(), feet: () => d.walk.feet(), aim: () => d.walk.fireAim(),
    net: () => { const client = d.client(); return client?.state === 'open' ? client : null; },
    press: () => actionPressure?.() ?? pressure.value(), sound: (name, at, volume) => { d.sound()?.audio.play(name, at, 'play', volume); },
    move: (path, delta) => { state.move(path, delta); world?.nodeMoved(path, delta); },
  });
  doors.setMap(d.map.doors, d.map.ground);
  const gates = new GatePage({
    net: () => { const client = d.client(); return client?.state === 'open' ? client : null; },
    // MatchMount moves only the render node here. WorldState's gate/crane sound
    // origin propagation is still its explicit LATER 895, not changed here.
    move: state.move,
  });
  gates.setMap(d.map.gates, d.map.ground, d.map.doors?.length ?? 0);
  const craneValves = new Set(d.map.craneValves?.map(valve => valve.toLowerCase()));
  let followed: NetClient | null = null, disposed = false, padHeld = false, keyHeld = false, cancelled = false, keyIgnored = false;
  const canAct = () => d.enabled() && d.walk.mode() === 'walk' && !d.walk.isDead() && !d.walk.isLocked();
  const pick = () => canAct() && !d.walk.actionGateShut() && doors.target() !== null ? 'door' as const : null;
  const lifecycle = new ActionLifecycle(pick);
  const edge = (was: boolean, down: boolean) => {
    if (cancelled) { if (!down) cancelled = false; return; }
    if (down && !was) lifecycle.press();
    else if (!down && was && lifecycle.release().fire === 'door') doors.action();
  };
  const cancel = () => {
    lifecycle.cancel('blur'); cancelled = cancelled || padHeld;
    keyHeld = false; keyIgnored = false;
  };
  const follow = () => {
    const next = d.client();
    if (followed === next) return;
    followed?.setWorld(null); followed = next; followed?.setWorld(() => world);
  };
  return { frame: state.frame, follow, cancel,
    /** The shared match-action adapter owns these contexts when mounted; it
     * replaces this helper's door-only input rather than driving both routes. */
    world: () => world,
    doors: { target: () => doors.target(), action: () => doors.action() },
    gates: { press: (action: number, seq: number) => gates.press(action, seq) },
    /** Experimental capability gate, not a replacement for ActionPage's pick.
     * CranePage's local-X spin and facade movement are not mounted yet. */
    supportsSwitch: (valve: string) => !craneValves.has(valve.toLowerCase()),
    setActionPressure(read: (() => number) | null) { actionPressure = read; },
    input(action: boolean, dt: number) {
      const was = padHeld || keyHeld, active = canAct();
      // Cancel before replacing the previous physical level with an unfocused
      // empty poll. Keep the latch until a focused release is observed.
      if (!active) cancel();
      padHeld = action;
      const down = padHeld || keyHeld;
      // MatchActions.lanes chases even when a living action is gated, except
      // while its actual respawn-dead controller owns the lanes. Never reset
      // pressure on a cancel: let the original chase decay the released input.
      if (!d.respawnInputActive?.()) pressure.step(down, dt);
      if (!active) { if (padHeld) cancelled = true; return; }
      edge(was, down); lifecycle.hold(dt);
    },
    /** Browser keyboard adaptation: X is the same action as the pad. Preserve
     * short taps between frames, ignore auto-repeat and never turn a dead-route
     * keyup into a living door release. Blur is a cancel, never an action. */
    key(event: KeyboardEvent) {
      if (event.code !== 'KeyX') return;
      if (event.type === 'keydown') {
        if (event.repeat || keyHeld || keyIgnored) return;
        if (event.ctrlKey || event.metaKey || event.altKey || !canAct()) { keyIgnored = true; return; }
        const was = padHeld || keyHeld; keyHeld = true;
        pressure.step(true, 0); edge(was, true);
      } else if (event.type === 'keyup') {
        const was = padHeld || keyHeld, ignored = keyIgnored; keyHeld = false; keyIgnored = false;
        if (ignored || !canAct()) { lifecycle.cancel('loading'); return; }
        pressure.step(padHeld, 0); edge(was, padHeld);
      }
    },
    step(dt: number) { if (disposed) return; follow(); doors.frame(dt); gates.frame(dt); world?.step(dt); },
    prompt() { return pick(); },
    report() { return { doors: doors.stats(), gates: gates.stats(), revision: world?.revision ?? null, operations: state.frame.operations.size,
      omittedEffects: { ...omitted }, actionContexts: ['door'], unsupported: ['moving cranes and facade attachments', 'gate handle animation/program sounds (shared GatePage limitation)', 'scene particles/common effects'] }; },
    dispose() { if (disposed) return; disposed = true; cancel(); followed?.setWorld(null); followed = null; state.dispose(); },
  };
}
