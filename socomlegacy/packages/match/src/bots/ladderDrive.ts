import { TICK_HZ, type Command } from '../../../viewer/src/net/protocol';
import type { MoverSim } from '../../../viewer/src/net/moverSim';
import { MAX_YAW_RATE } from '../../../viewer/src/look';
import { shortTurn, wrapYaw } from '../../../viewer/src/yaw';
import { SEAL_TUNING_DEFAULTS } from '../../../viewer/src/physics';
import { Traversal } from '../../../viewer/src/traversal';
import { BOT_LADDER_ENTRY_TOLERANCE_ADAPTATION, type BotLadderLink, type Point } from './navigation';

/** Authored CPU input policy (OT.R81), not retail AI or new ladder physics. */
const LADDER_INPUT_ADAPTATION = { alignDegrees:2, timeoutTicks:60*TICK_HZ,
  entrySpeed:1, approachGain:0.15, approachDamping:0.03 };

/** Keeps ordinary pad input committed through the native mount, rung cycle and dismount. */
export class BotLadderDrive {
  private mounted = false;
  private returning = false;
  private approached = false;
  constructor(readonly link: BotLadderLink, private readonly started: number, private readonly canExit: (at: Point, destination: Point) => boolean) {}

  step(sim: MoverSim, tick: number): { command: Command | null; done: boolean; failed: boolean } {
    const busy = sim.moves?.busy() ?? false;
    const native = sim.moves instanceof Traversal ? sim.moves.state() : null;
    const onLadder = busy && native?.ladder != null && (native.kind.startsWith('ladder') || native.kind === 'turn180');
    this.mounted ||= onLadder;
    this.approached ||= onLadder;
    const s = sim.walker.state;
    const expired = tick - this.started >= LADDER_INPUT_ADAPTATION.timeoutTicks;
    if (expired && busy) this.returning = true;
    const at: Point = [s.x,s.y,s.z], destination = this.returning ? this.link.entry : this.link.exit;
    const clear = (point: Point): boolean => Math.abs(s.y - point[1]) <= SEAL_TUNING_DEFAULTS.step_height && this.canExit(at,point);
    if ((!this.mounted && expired && !busy) || (this.mounted && !busy && (clear(destination) || (this.returning && clear(this.link.exit))))) return {
      // Finish only after the native dismount can reconnect to walking. Until then keep walking away from the rungs.
      command: {seq:sim.seq + 1, yaw:s.yaw, pitch:s.pitch, turn:0, buttons:0, stance:0, weapon:sim.weapon, forward:0, right:0},
      done:true, failed:this.returning || !this.mounted,
    };
    const want = wrapYaw(Math.atan2(this.link.ladder.nx, this.link.ladder.nz) * 180 / Math.PI);
    const error = shortTurn(s.yaw, want), limit = MAX_YAW_RATE * 180 / Math.PI / TICK_HZ;
    const turn = Math.max(-limit, Math.min(limit, error));
    // Downward travel backs onto the head while facing the rungs, then keeps the same backward stick on the ladder.
    const direction = (this.link.up ? 1 : -1) * (this.returning ? -1 : 1);
    let forward = busy || Math.abs(error) <= LADDER_INPUT_ADAPTATION.alignDegrees ? direction : 0, right = 0;
    if (!this.mounted && !this.approached) {
      const dx = this.link.entry[0] - s.x, dz = this.link.entry[2] - s.z;
      if (Math.hypot(dx,dz) <= BOT_LADDER_ENTRY_TOLERANCE_ADAPTATION && Math.hypot(s.vx,s.vz) <= LADDER_INPUT_ADAPTATION.entrySpeed) this.approached = true;
      else {
        // Reach the selected approach, including its side offset, before pushing at the ladder plane.
        const r = (s.yaw + turn) * Math.PI / 180, fx = -Math.sin(r), fz = -Math.cos(r), rx = Math.cos(r), rz = -Math.sin(r);
        const stick = (x:number,z:number): number => Math.max(-1,Math.min(1,
          (dx*x + dz*z) * LADDER_INPUT_ADAPTATION.approachGain - (s.vx*x + s.vz*z) * LADDER_INPUT_ADAPTATION.approachDamping));
        forward = Math.abs(error) <= LADDER_INPUT_ADAPTATION.alignDegrees ? stick(fx,fz) : 0;
        right = Math.abs(error) <= LADDER_INPUT_ADAPTATION.alignDegrees ? stick(rx,rz) : 0;
      }
    }
    return { done:false, failed:false, command: {
      seq: sim.seq + 1, yaw: wrapYaw(s.yaw + turn), pitch: 0, turn: turn * Math.PI / 180 * TICK_HZ,
      buttons:0, stance: 0, weapon: sim.weapon, forward, right,
    } };
  }
}
