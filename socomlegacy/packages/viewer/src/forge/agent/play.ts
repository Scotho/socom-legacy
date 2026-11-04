import { noInput, type Input } from '../../gamepad';

/** Browser adaptation. Only the private Forge Play mount receives this normal-input port. No simulation setters. */
export interface ForgePlayState {
  ready: boolean; local: boolean; visible: boolean; menu: boolean; armory: boolean;
  map: { archive: string; path: string; name: string } | null;
  pose: unknown; feet: readonly number[] | null; equipment: unknown; action: unknown; plant: unknown;
}
/** LATER 426: the five flags the port gates on every frame -- cheap, read each frame by the match. */
export type ForgePlayGate = Pick<ForgePlayState, 'ready' | 'local' | 'visible' | 'menu' | 'armory'>;
/**
 * What the match hands the port each frame: the whole state (as before), or the gate and a `read()` for the rest, which
 * the driver calls only when an `observe` step or a status read needs it, at most once a frame (LATER 426). A status read
 * between two frames calls the last frame's `read()`: it sees the host as it is at the call, with that frame's gate.
 */
export type ForgePlayFrame = ForgePlayState | (ForgePlayGate & { read(): ForgePlayState });
export interface ForgePlayControls {
  /** Called with what the agent itself held; a human's own held action or stick is never cancelled. */
  release(held: { action: boolean; fire: boolean; stance: boolean }): void;
  equip(item: 'rifle' | 'pistol' | 1 | 2 | 3): boolean;
  armoryKey(code: string): boolean;
}
export interface ForgePlayPort {
  bind(controls: ForgePlayControls): void;
  /** Real rendered simulation dt, supplied by the match; the driver never advances the simulation. */
  frame(dt: number, state: ForgePlayFrame): Input;
  cancel(reason: string): void;
  end(reason: string): void;
}
type Result = { ok: boolean; code?: string; message?: string; data?: unknown };
interface Step { operation: string; args: Record<string, unknown>; seconds: number }
interface Job { jobId: string; state: 'running' | 'completed' | 'failed' | 'cancelled'; step: number; elapsed: number;
  stepElapsed: number; started: boolean; steps: Step[]; results: unknown[]; observations: unknown[]; message: string | null; wallStart: number }
export const FORGE_PLAY_AXES = ['moveX', 'moveY', 'lookX', 'lookY'] as const;
export const FORGE_PLAY_BUTTONS = ['jump', 'crouch', 'prone', 'stance', 'fire', 'reload', 'action', 'swap1', 'swap2'] as const;
export const FORGE_PLAY_OPERATIONS = ['input.set', 'input.release', 'action.press', 'action.hold', 'action.release', 'action.cancel',
  'equipment.equip', 'armory.key', 'scenario.start', 'scenario.status', 'scenario.cancel'] as const;
const fields = ['map', 'feet', 'pose', 'equipment', 'action', 'plant', 'plant.state', 'plant.carrier', 'action.prompt', 'action.playerMode', 'action.playing'];
const stepOperations = ['input.set', 'input.release', 'action.press', 'action.hold', 'action.release', 'action.cancel', 'equipment.equip', 'armory.key', 'observe', 'wait'];
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value ?? null)) as T;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
function valid(operation: string, args: Record<string, unknown>): boolean {
  const keys = Object.keys(args);
  if (operation === 'input.set') return keys.length > 0 && keys.every((k) =>
    (FORGE_PLAY_AXES as readonly string[]).includes(k) ? typeof args[k] === 'number' && Number.isFinite(args[k]) && Math.abs(args[k] as number) <= 1
      : (FORGE_PLAY_BUTTONS as readonly string[]).includes(k) && typeof args[k] === 'boolean');
  if (operation === 'equipment.equip') return keys.length === 1 && ['rifle', 'pistol', 1, 2, 3].includes(args['item'] as string | number);
  if (operation === 'armory.key') return keys.length === 1 && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Backspace'].includes(args['code'] as string);
  if (operation === 'observe') return keys.length === 2 && fields.includes(args['field'] as string) && Object.hasOwn(args, 'equals');
  return [...FORGE_PLAY_OPERATIONS, 'wait'].includes(operation as typeof FORGE_PLAY_OPERATIONS[number]) && keys.length === 0;
}
function stepsOf(raw: unknown): Step[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 32) return null;
  const steps: Step[] = []; let duration = 0;
  for (const value of raw) {
    if (!object(value) || Object.keys(value).some((k) => !['operation', 'args', 'seconds'].includes(k)) || !stepOperations.includes(value['operation'] as string)) return null;
    const args = value['args'] ?? {}, seconds = value['seconds'] ?? 0;
    if (!object(args) || !valid(value['operation'] as string, args) || typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0 || seconds > 60) return null;
    duration += seconds; if (duration > 60) return null;
    steps.push({ operation: value['operation'] as string, args: clone(args), seconds });
  }
  return steps;
}
export function createForgePlayDriver(deps: { now(): number }) {
  let controls: ForgePlayControls | null = null;
  // LATER 426: the gate each frame; the rest read lazily from the frame's source, once a frame at most.
  let gate: ForgePlayGate | null = null;
  let source: (() => ForgePlayState) | null = null;
  let frameNo = 0;
  let cached: { frame: number; value: ForgePlayState } | null = null;
  function full(): ForgePlayState | null {
    if (!source) return null;
    if (cached?.frame !== frameNo) cached = { frame: frameNo, value: clone(source()) };
    return cached.value;
  }
  let held = noInput(), number = 0;
  let job: Job | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let detachSignal: (() => void) | undefined;
  const usable = (): boolean => !!controls && !!gate?.local && gate.visible && gate.ready && !gate.menu;
  const clearTimer = (): void => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
  function release(): void {
    const active = Object.values(held).some((v) => v !== 0 && v !== false);
    const was = { action: held.action === true, fire: held.fire === true, stance: held.stance === true };
    held = noInput();
    if (job?.state !== 'running') { clearTimer(); detachSignal?.(); detachSignal = undefined; }
    if (active) controls?.release(was);
  }
  function cancel(reason: string): void {
    if (job?.state === 'running') { job.state = 'cancelled'; job.message = reason; }
    release();
  }
  const status = () => clone(job && { jobId: job.jobId, state: job.state, step: job.step, elapsed: job.elapsed,
    results: job.results, observations: job.observations, message: job.message });
  const input = (): Input => usable() ? { ...held } : noInput();
  const fail = (code: string, message: string): Result => ({ ok: false, code, message });
  function watch(signal?: AbortSignal): void {
    detachSignal?.(); detachSignal = undefined;
    if (signal) {
      const aborted = (): void => cancel('request aborted');
      signal.addEventListener('abort', aborted, { once: true });
      detachSignal = () => signal.removeEventListener('abort', aborted);
      if (signal.aborted) aborted();
    }
  }
  function wallLimit(): void {
    clearTimer();
    timer = setTimeout(() => { if (job?.state === 'running') { job.state = 'failed'; job.message = '30 second wall limit'; } release(); }, 30_000);
  }
  function command(operation: string, args: Record<string, unknown>): Result {
    if (operation === 'input.set') held = { ...held, ...args } as Input;
    else if (operation === 'action.press' || operation === 'action.hold') held.action = true;
    else if (operation === 'action.release') held.action = false;
    else if (operation === 'input.release' || operation === 'action.cancel') release();
    else if (operation === 'equipment.equip') {
      if (!controls?.equip(args['item'] as 'rifle' | 'pistol' | 1 | 2 | 3)) return fail('REFUSED', 'The normal equipment selection gate refused');
    } else if (operation === 'armory.key') {
      if (!gate?.armory || !controls?.armoryKey(args['code'] as string)) return fail('REFUSED', 'The ARMORY is closed or refused this normal menu key');
    } else return fail('UNKNOWN_OPERATION', operation);
    return { ok: true, data: { accepted: true } };
  }
  const execute = (operation: string, args: Record<string, unknown>, signal?: AbortSignal): Result => {
    if (signal?.aborted) return fail('CANCELLED', 'The request was aborted');
    if (operation === 'scenario.status') return { ok: true, data: status() };
    if (operation === 'scenario.cancel') { cancel('scenario cancelled'); return { ok: true, data: status() }; }
    if (operation === 'input.release' || operation === 'action.cancel') { cancel('manual input release'); return { ok: true }; }
    if (!usable() && !(operation === 'armory.key' && gate?.local && gate.visible && gate.ready && gate.armory)) return fail('PLAY_NOT_READY', 'Only a visible, ready, private Forge Play match permits normal inputs');
    if (job?.state === 'running') return fail('BUSY', 'Cancel the running scenario before manual input');
    if (operation === 'scenario.start') {
      const steps = stepsOf(args['steps']); if (!steps) return fail('INVALID_ARGUMENT', 'A scenario needs 1..32 normal-input steps totalling at most 60 simulation seconds');
      release();
      job = { jobId: `forge-${++number}`, state: 'running', step: 0, elapsed: 0, stepElapsed: 0, started: false,
        steps, results: [], observations: [], message: null, wallStart: deps.now() };
      watch(signal); wallLimit(); return { ok: true, data: { jobId: job.jobId } };
    }
    if (!valid(operation, args)) return fail('INVALID_ARGUMENT', 'Invalid normal-input arguments');
    const result = command(operation, args);
    if (result.ok && (operation === 'input.set' || operation === 'action.press' || operation === 'action.hold')) { watch(signal); wallLimit(); }
    return result;
  };
  const port: ForgePlayPort = {
    bind: (next) => { cancel('new match input port'); controls = next; },
    cancel,
    end: (reason) => { cancel(reason); controls = null; gate = null; source = null; cached = null; },
    frame(dt, state) {
      frameNo++;
      gate = { ready: state.ready, local: state.local, visible: state.visible, menu: state.menu, armory: state.armory };
      source = 'read' in state && typeof state.read === 'function' ? state.read : () => state as ForgePlayState;
      if (!usable()) { cancel(state.menu ? 'a menu owns input' : 'private match input became unavailable'); return noInput(); }
      if (job?.state === 'running') {
        const elapsed = Number.isFinite(dt) && dt > 0 ? dt : 0;
        job.elapsed += elapsed;
        if (job.elapsed > 60 || deps.now() - job.wallStart >= 30_000) { job.state = 'failed'; job.message = 'Scenario time limit'; release(); return noInput(); }
        const step = job.steps[job.step]!;
        const started = job.started;
        if (!started) {
          job.started = true; job.stepElapsed = 0;
          if (step.operation !== 'observe' && step.operation !== 'wait') {
            const result = command(step.operation, step.args); job.results.push({ step: job.step, operation: step.operation, result });
            if (!result.ok) { job.state = 'failed'; job.message = result.message ?? 'Step refused'; release(); return noInput(); }
          }
        } else job.stepElapsed += elapsed;
        const [field, member] = (step.args['field'] as string | undefined)?.split('.') ?? [];
        const value = field ? (full() as unknown as Record<string, unknown>)[field] : null;
        const observed = clone(member ? object(value) ? value[member] : null : value);
        const matched = step.operation === 'observe' && JSON.stringify(observed) === JSON.stringify(step.args['equals']);
        if (matched || (started || step.operation === 'observe' || step.operation === 'wait') && job.stepElapsed >= step.seconds) {
          if (step.operation === 'observe') job.observations.push({ step: job.step, field: step.args['field'], expected: step.args['equals'], observed, matched });
          if (step.operation === 'observe' && !matched) { job.state = 'failed'; job.message = 'Expected observation was not seen'; release(); }
          else { job.step++; job.started = false; if (job.step >= job.steps.length) { job.state = 'completed'; release(); } }
        }
      }
      return input();
    },
  };
  return { port, execute, status, input, cancel, read: (): ForgePlayState | null => { const value = full(); return value && clone(value); } };
}
