/**
 * CONTROLLER OPTIONS' VIBRATION (CTL-2, OT.R72; research 302 §10): the pad's two motors as the game keeps them. The
 * player's record holds the small motor's time (`+0x13c`), the large one's time (`+0x140`) and strength (`+0x144`):
 *
 * - `FUN_00592b40` (D:L451844-451858), the large motor: only while the toggle `DAT_00650698` (VIBRATION ON) is set, the
 *   strength taken when it is higher than the held one or the motor's time has run out, the time when it is longer;
 * - `FUN_00592ba0` (D:L451861-451868), the small motor: only while the toggle is set, the time when it is longer;
 * - `FUN_005929a0` (D:L451780-451812), each frame: while the large time is above 0 the pad's `+0xb5` is the strength's
 *   byte (`(char)(int)`) and the time runs down by the frame's dt; else the strength and the byte are 0. While the small
 *   time is above 0 the pad's `+0xb4` is 1 (the small motor is on or off) and the time runs down; else 0;
 * - `FUN_00592ac0` (D:L451819-451840), the reset (the death's first step, `FUN_00547af0`): both bytes and the three
 *   fields 0.
 *
 * What the pad's two bytes drive is libpad's actuators (owed, research 302 §10); in the browser they are the Gamepad's
 * `vibrationActuator`, or Firefox's `hapticActuators` (`rumbleOutput`, `padActuator`: a labelled browser adaptation).
 */

/** The pad's two actuator bytes as `FUN_005929a0` leaves them: the small motor on or off, the large one's strength. */
export interface RumbleBytes { small: 0 | 1; large: number }

/**
 * The player's three rumble fields and the pad's two bytes. The toggle (VIBRATION_CONTROLLER, `DAT_00650698`) is asked by
 * each setter as it runs, as the original's read the global -- never when made (a page may make the motors before what
 * answers the toggle exists).
 */
export class Rumble {
  private smallTime = 0;
  private largeTime = 0;
  private largeStrength = 0;
  private out: RumbleBytes = { small: 0, large: 0 };
  private readonly on: () => boolean;

  constructor(enabled: boolean | (() => boolean)) { this.on = typeof enabled === 'function' ? enabled : () => enabled; }

  /** `FUN_00592b40`: the large motor for `time` seconds at `strength` (0..255). */
  large(time: number, strength: number): void {
    if (!this.on()) return;
    if (this.largeStrength < strength || this.largeTime <= 0) this.largeStrength = strength;
    if (this.largeTime < time) this.largeTime = time;
  }

  /** `FUN_00592ba0`: the small motor for `time` seconds. */
  small(time: number): void {
    if (this.on() && this.smallTime < time) this.smallTime = time;
  }

  /** `FUN_005929a0`: one frame of `dt` seconds; answers the pad's two bytes for it. */
  frame(dt: number): RumbleBytes {
    let large = 0;
    if (this.largeTime > 0) {
      large = Math.trunc(this.largeStrength) & 0xff;
      this.largeTime = Math.fround(this.largeTime - dt);
    } else this.largeStrength = 0;
    let small: 0 | 1 = 0;
    if (this.smallTime > 0) {
      small = 1;
      this.smallTime = Math.fround(this.smallTime - dt);
    }
    this.out = { small, large };
    return this.out;
  }

  /** `FUN_00592ac0`: both bytes and the three fields 0. */
  reset(): void {
    this.smallTime = 0; this.largeTime = 0; this.largeStrength = 0;
    this.out = { small: 0, large: 0 };
  }

  /** The bytes the last frame wrote. */
  bytes(): RumbleBytes { return this.out; }
}

const f = Math.fround;

/**
 * SCOPE_PULSE_TIMER_READING (research 302 §9, §10; the CTL-2 review's F5): the pulse's timer and phase are the kit's
 * `+0x4c` / `+0x48` and no write of them but `FUN_005b9280`'s own was read -- so they are kept across scope exits, deaths
 * and respawns (one `ScopePulse` a mount). Whether the actor and its kit (`+0x5e0`) are rebuilt at a respawn, which would
 * zero them, is not settled. Settles: the kit's constructor and the respawn's path read for `+0x48` / `+0x4c`. [reading]
 */
export const SCOPE_PULSE_TIMER_READING = 'kept across scopes, deaths and respawns' as const;

/**
 * RUMBLE_MENU_STOP_READING (research 302 §9, §10; the CTL-2 review's F2): the START menu's open (`FUN_00204a40`) resets the
 * motors (`FUN_00592ac0`, D:L61940) and clears the actor's `+0x5e1` bit 7 (D:L62000), which gates the pulse's tick
 * (`FUN_005b9280`, D:L418390-418393); the tactical map (D:L64810, D:L64829; not in the port) and `FUN_00228ee0`
 * (D:L78529-78531; which screen it opens is not read) do the same. The port stops them under the START menu alone.
 * Settles: `FUN_00228ee0`'s caller read for its screen. [reading]
 */
export const RUMBLE_MENU_STOP_READING = 'the START menu alone' as const;

/**
 * The scope's pulse (`FUN_005b9280` D:L472076-472093, the scoped sway's tick: it runs only in a scope, `./accuracy`): while
 * the body's exertion v (`FUN_005781b0`, `body+0xeb0`'s current value) is over 0.2 and the view is not state 4, the kit's
 * timer (`+0x4c`) runs; in phase 0 (`+0x48`) past (1 - v) x 0.24 + 0.3 s a beat of the large motor 0.1 s, in phase 1 past
 * (1 - v) x 0.64 + 0.8 s one of 0.16 s, each at 100 v + 20 (read at the instructions, 0x5b9350-0x5b9364), the timer
 * reset and the phase flipped. The timer and the phase are the kit's and no reset of them was read: kept across scopes
 * (`SCOPE_PULSE_TIMER_READING`).
 */
export class ScopePulse {
  private timer = 0;
  private phase: 0 | 1 = 0;

  /** One scoped frame of `dt` seconds at exertion `v` in view state `view`, beating `rumble`'s large motor. */
  tick(dt: number, v: number, view: number, rumble: Rumble): void {
    if (!(f(0.2) < v) || view === 4) return;
    this.timer = f(this.timer + dt);
    const strength = f(f(v * f(100)) + f(20));
    if (this.phase === 0) {
      if (f(f(f(1 - v) * f(0.24000001)) + f(0.3)) < this.timer) {
        if (0 < strength) rumble.large(f(0.1), strength);
        this.timer = 0; this.phase = 1;
      }
    } else if (f(f(f(1 - v) * f(0.64000005)) + f(0.8)) < this.timer) {
      if (0 < strength) rumble.large(f(0.16), strength);
      this.timer = 0; this.phase = 0;
    }
  }
}

/** The part of the Gamepad API the output needs (`GamepadHapticActuator.playEffect`, 'dual-rumble'). */
export interface RumbleActuator {
  playEffect(type: 'dual-rumble', params: { duration: number; startDelay?: number; strongMagnitude: number; weakMagnitude: number }): Promise<unknown>;
  reset?(): Promise<unknown>;
}

/**
 * RUMBLE_OUTPUT_ADAPTATION (a browser adaptation; the PS2's libpad has no counterpart in the page): the pad's two bytes
 * to the Gamepad's 'dual-rumble' -- the large motor's strength / 255 as `strongMagnitude`, the small motor's on as
 * `weakMagnitude` 1 -- played for `holdMs` when the bytes change and renewed every `renewFrames` frames while they hold
 * (so a long rumble never lapses and a stop is felt within a frame), and reset when both fall to 0. Never called while
 * VIBRATION is OFF: the setters write nothing then (the toggle `Rumble` asks), so the bytes stay 0. With no actuator (no pad,
 * or a browser without the API) nothing. Firefox's pads carry no 'dual-rumble' but `hapticActuators[0].pulse(value,
 * duration)`, one motor: it takes the stronger of the two magnitudes for the same hold, and a pulse of 0 for the stop (B137,
 * the owner's report of 2026-10-23; `padActuator`).
 * The pulse path's stop (`pulse(0, 0)`) is not shown on hardware to cancel a pulse already running (B137's review F2):
 * if it does not, a stop runs on for up to the hold (250 ms); moot while Firefox on Windows exposes no actuators.
 */
export const RUMBLE_OUTPUT_ADAPTATION = 'dual-rumble: strong = large / 255, weak = small' as const;

/** The death's rumble (`FUN_00547af0` D:L413097-413100): the reset, then the large motor 0.18 s at 175, the small 0.04 s. */
export function deathRumble(r: Rumble): void {
  r.reset();
  r.large(f(0.18), 175);
  r.small(f(0.04));
}

/**
 * The hurt's rumble (j5t3o2iU; research 302 §10; reading, pending review): a health drop the page's own body survives --
 * a bullet's, a blast's, a fall's (`FUN_005a54d0` D:L461395-461396) -- runs `FUN_005477a0` (D:L412828-412838), which
 * calls the controller's `+0x54`, `FUN_00597b00` (D:L454498-454524). After the hurt voice (its `+0x24`, behind the voice
 * gate; the motors are not), where its `+0x34` answers 0 -- the SEAL controller's (ELF vtable entry 0x544200) and a
 * controller vtable at 0x4062d0 (class unnamed; entry 0x221d30), not the remote controller's (0x5e6260, 1) -- it writes
 * the motors inline as `FUN_00592b40` / `FUN_00592ba0` would: the large one to 175 where under it or stopped and to 0.18 s where shorter (D:L454513-454518), the small one to
 * 0.04 s where shorter (D:L454520-454522; the small motor has no strength, `FUN_005929a0`), each only while VIBRATION is
 * on. No reset, unlike the death.
 */
export function hurtRumble(r: Rumble): void {
  r.large(f(0.18), 175);
  r.small(f(0.04));
}

/** A shot's rumble (`FUN_005c3360` D:L477739-477751): the weapon record's motors, each where its flag is on. */
export function shotRumble(r: Rumble, rumble: { small: number | null; large: { time: number; power: number } | null } | undefined): void {
  if (!rumble) return;
  if (rumble.small !== null) r.small(rumble.small);
  if (rumble.large) r.large(rumble.large.time, rumble.large.power);
}

/** The first connected pad's actuator, if the browser gives one (`RUMBLE_OUTPUT_ADAPTATION`); else null. */
/** A pad as the Gamepad API hands it, the parts the output reads: Chromium's `vibrationActuator`, Firefox's `hapticActuators`. */
interface PadLike {
  id?: string;
  connected?: boolean;
  vibrationActuator?: RumbleActuator | null;
  hapticActuators?: ArrayLike<{ pulse?: (value: number, duration: number) => Promise<unknown> } | null> | null;
}

/** Which rumble a pad offers the page: Chromium's 'dual-rumble', Firefox's 'pulse', or none (the pad or its adapter has no motor the browser can reach). */
export function padRumbleForm(pad: PadLike | null | undefined): 'dual-rumble' | 'pulse' | null {
  if (!pad) return null;
  if (pad.vibrationActuator) return 'dual-rumble';
  return typeof pad.hapticActuators?.[0]?.pulse === 'function' ? 'pulse' : null;
}

/** Firefox's one-motor `pulse` behind the output's 'dual-rumble' (RUMBLE_OUTPUT_ADAPTATION): the stronger magnitude, the same hold. */
function pulseActuator(h: { pulse: (value: number, duration: number) => Promise<unknown> }): RumbleActuator {
  return {
    playEffect: (_type, p) => h.pulse(Math.max(p.strongMagnitude, p.weakMagnitude), p.duration),
    reset: () => h.pulse(0, 0),
  };
}

const unrumbled = new Set<string>();

/**
 * The first connected pad's actuator, either form; null with none. A connected pad that offers neither is said once on the
 * console (`note`), so a person with that pad can tell the page's silence from a pad the browser cannot rumble. The note
 * names the common case (read 2026-10-23 at Firefox's source, `dom/gamepad/windows/WindowsGamepad.cpp`: both `AddGamepad`
 * calls pass 0 haptics, "TODO: Bug 680289"; its pref `dom.gamepad.haptic_feedback.enabled` is already true).
 */
export function padActuator(
  nav: { getGamepads?: () => ArrayLike<unknown> } | undefined = globalThis.navigator,
  note: (message: string) => void = (m) => { console.info(m); },
): RumbleActuator | null {
  try {
    let quiet: PadLike | null = null;
    for (const p of Array.from(nav?.getGamepads?.() ?? []) as (PadLike | null)[]) {
      if (!p?.connected) continue;
      const form = padRumbleForm(p);
      if (form === 'dual-rumble') return p.vibrationActuator!;
      if (form === 'pulse') return pulseActuator(p.hapticActuators![0]! as { pulse: (value: number, duration: number) => Promise<unknown> });
      quiet ??= p;
    }
    const id = quiet?.id ?? '';
    if (quiet && !unrumbled.has(id)) {
      unrumbled.add(id);
      note(`VIBRATION: the pad "${id}" offers this browser no rumble (neither vibrationActuator nor hapticActuators); the page cannot make it vibrate. `
        + 'Firefox on Windows makes no rumble for any gamepad yet (Mozilla bug 680289); Chrome and Edge do for most pads.');
    }
  } catch { /* no Gamepad API */ }
  return null;
}

/** The output, called once a frame with that frame's bytes: what it played last, and the frames since. */
export function rumbleOutput(holdMs = 250, renewFrames = 4) {
  let last: RumbleBytes = { small: 0, large: 0 }, since = 0;
  return (bytes: RumbleBytes, actuator: RumbleActuator | null | undefined): void => {
    const same = bytes.small === last.small && bytes.large === last.large;
    const on = bytes.small !== 0 || bytes.large !== 0;
    if (same && (!on || ++since < renewFrames)) return;
    last = bytes; since = 0;
    if (!actuator) return;
    if (!on) { void actuator.reset?.()?.catch(() => {}); return; }
    void actuator.playEffect('dual-rumble', { duration: holdMs, strongMagnitude: bytes.large / 255, weakMagnitude: bytes.small }).catch(() => {});
  };
}
