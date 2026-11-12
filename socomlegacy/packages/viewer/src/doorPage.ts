import type { Grid } from '@s2u/scene';
import { DoorSet, doorPick, pickDoor, useSeconds, type DoorSpec } from './doors';
import type { GroundData } from './mover';
import type { ClientEvent, DoorWire } from './net/protocol';

/**
 * The doors on the page (`./doors`, socomlegacy/docs/research/92-doors.md): the map's `DoorSet` on the walk's own hull, its
 * swings drawn (`WorldView.moveNode`) and heard (the zAnim's `SOUND`), the door under the reticle for the HUD's prompt
 * and the action button, and -- in a match -- the server's doors followed from the snapshots, the action sent to it
 * as a `door` event and predicted here until its snapshot settles it (P7, `DOOR_PREDICT_ADAPTATION`). `main.ts` makes one.
 */

/** What the page lends the doors. */
export interface DoorPageDeps {
  /** The walk: its hull's grid, the feet, the view's aim (`WalkMode.fireAim`); null when not walking. */
  grid(): Grid | null;
  feet(): [number, number, number] | null;
  aim(): { eye: readonly number[]; far: readonly number[] } | null;
  /** A door's SOUND command: the name, where, and the command's own volume (`DoorHooks.sound`). */
  sound(name: string, at: [number, number, number], volume: number): void;
  /** The drawn leaf moved (`WorldView.moveNode`). */
  move(path: string, delta: Float32Array): void;
  /** The match, when in one and open: where the doors come from, and (a player's) where the action goes. */
  net(): {
    role: string; send(ev: ClientEvent): void; lastSeq(): number; doors(): DoorWire[] | undefined; takeDoorPicks?(): { door: number; pick: 0 | 1 }[];
    /**
     * P7: the last command the room had run as of the newest snapshot (`NetClient.acked`), null with no own body in it (a
     * dead seat): settles a predicted press. Absent: not known, and a prediction waits for the room's swing.
     */
    acked?(): number | null;
    /** DOOR-RESET: the client's round epoch (a round start resets the page's doors as the room's); absent or null: not known. */
    roundEpoch?(): number | null;
  } | null;
  /**
   * LATER 362: the action button's chased pressure (`./traversalPage` `actionPress`, `chaseActionPress`), read at the
   * release that uses the door: sent on the `door` event, or picked here with no room (`doorPick`). Absent: none sent, the open.
   */
  press?(): number;
  /**
   * DOORS (research 92 section 2): the door program's `ai::ANIMATE` pushed anim `type` (63, `Open door`) on the page's
   * own body -- for its own press with no room (`DoorActor` 'self'); in a match the room's `motion` event carries it
   * (`./netPage`), and a swing followed off the wire pushes none here.
   */
  pushClip?(type: number): void;
}

export class DoorPage {
  private set: DoorSet | null = null;
  /** The last action's door and whether it was taken, for the hook. */
  private last: { door: number; taken: boolean; sent: boolean } | null = null;
  /** HOTFIX DOOR-RESET: the match's round epoch the doors stand in (`frame`), or undefined before a match's first. */
  private epoch: number | undefined = undefined;
  /** HOTFIX DOOR-RESET: the snapshot's door array the reset was made under, not followed (it may be the last round's). */
  private staleWire: readonly DoorWire[] | undefined = undefined;

  constructor(private readonly deps: DoorPageDeps) {}

  /** A new map: its doors on its hull (the one the walk stands on: `LoadedMap.ground`), shut, drawn where the disc has them. */
  setMap(doors: readonly DoorSpec[] | undefined, ground: GroundData | undefined): void {
    this.set = doors?.length ? new DoorSet(doors, ground ?? null, {
      sound: (name, at, volume) => this.deps.sound(name, at, volume),
      moved: (door, delta) => this.deps.move(door.path, delta),
      animate: (_door, type, actor) => { if (actor === 'self') this.deps.pushClip?.(type); },
    }) : null;
    this.last = null;
    this.epoch = undefined; this.staleWire = undefined;
  }

  /**
   * One frame: in a match the server's doors followed; the swings stepped. HOTFIX DOOR-RESET: at a new round (the
   * client's round epoch changed: its `roundStart`, or a snapshot that overtook it -- `NetClient.newEpoch`) the page's
   * doors are reset as the room's `startRound` resets its own (`DoorSet.reset`: ruling PF.R10, DOOR_ROUND_RESET_READING;
   * the level's reset `FUN_002ac0e0` D:L151976-151991) -- every valve 0, every run cut, each leaf at its disc rotation,
   * silently -- before any snapshot of the new round is followed. Was: none on the page, which ran the door's program
   * from its last round's state to catch up (`applyWire`'s run-out): a round started mid-swing left the page's leaf
   * swinging open where the room's stood shut, and a press in the new round's first ticks ran the old round's close.
   * The newest snapshot's doors when the epoch changed are not followed (they can be the last round's, a `roundStart`
   * ahead of its snapshot); the next snapshot is.
   */
  frame(dt: number): void {
    const set = this.set;
    if (!set) return;
    const net = this.deps.net();
    if (net) {
      const epoch = net.roundEpoch?.() ?? null;
      if (epoch !== null && epoch !== this.epoch) {
        if (this.epoch !== undefined) { set.reset(); this.staleWire = net.doors(); }
        this.epoch = epoch;
      }
      for (const u of net.takeDoorPicks?.() ?? []) set.followPick(u.door, u.pick);   // LATER 362: the room's kick or open
      const wire = net.doors();   // DOOR-RESET: the snapshot held at a round's reset is skipped once
      if (wire !== this.staleWire) { this.staleWire = undefined; set.applyWire(wire, net.acked ? net.acked() : undefined); }   // P7: a predicted press settled by the room's word
    }
    set.step(dt);
  }

  /** The door under the reticle within its reach (`pickDoor`), or null: the HUD's prompt and the action's target. */
  target(): number | null {
    const set = this.set, grid = this.deps.grid(), feet = this.deps.feet(), aim = this.deps.aim();
    if (!set || !grid || !feet || !aim) return null;
    return pickDoor(set, grid, aim.eye, aim.far, feet);
  }

  /**
   * G1 (action-labels review; reading, pending review): the door under the reticle's node and its valve's value now, for
   * its caption (OPEN DOOR, or CLOSE DOOR when the valve's short is non-zero: `./mapActions` `mapActionCaption`,
   * `FUN_002b48e0` D:L156975-156979), or null.
   */
  targetState(): { node: string; valve: number } | null {
    const i = this.target(), set = this.set;
    const spec = i === null || !set ? undefined : set.specs[i];
    return spec ? { node: spec.node, valve: set!.state(i!).valve } : null;
  }

  /** The action button (`WalkMode.setActionFilter`): true when a door took it -- used here, or asked of the server. */
  action(): boolean {
    const i = this.target();
    if (i === null || !this.set) return false;
    const net = this.deps.net();
    if (net) {
      if (net.role !== 'player') return false;
      const press = this.deps.press?.();
      net.send({ type: 'door', seq: net.lastSeq(), door: i, ...(press !== undefined ? { press } : {}) });
      // P7 (`DOOR_PREDICT_ADAPTATION`): run here at once, as the original's pressing console runs it, with the room's
      // pick from the same press (`doorPick`, as `Room.useDoor` picks it); the room's snapshot settles it (`frame`).
      const spec = this.set.specs[i];
      this.set.predict(i, this.deps.feet(), spec ? doorPick(spec, press ?? 0) : 0, net.lastSeq());   // the command the event named
      this.last = { door: i, taken: true, sent: true };
      return true;
    }
    const spec = this.set.specs[i];
    const taken = this.set.use(i, this.deps.feet(), 'self', spec ? doorPick(spec, this.deps.press?.() ?? 0) : 0);
    this.last = { door: i, taken, sent: false };
    return true;                                                   // refused mid-swing, the press is still the door's
  }

  /** For the hook: every door's node and state, the one under the reticle, and the last action. */
  stats(): { doors: { node: string; open: boolean; busy: boolean; valve: number; seconds: number | null }[]; target: number | null; last: DoorPage['last'] } {
    const set = this.set;
    return {
      doors: set ? set.specs.map((d, i) => ({ node: d.node, ...set.state(i), seconds: useSeconds(d) })) : [],   // `seconds`: a use's run (`useSeconds`)
      target: this.target(),
      last: this.last && { ...this.last },
    };
  }

  /** For the hook: the action on door `i` from the feet, bypassing the reticle (the tests' door). */
  use(i: number): boolean {
    return this.set?.use(i, this.deps.feet()) ?? false;
  }
}
