/**
 * The extension host (FCW-07b, XT-7): the sole registry of replaceable engine systems, a browser adaptation with no
 * original (`EXTENSION_HOST_ADAPTATION`; the contract is `docs/specs/2026-10-25-extension-contracts.md`). Modeled on
 * `ViewerRenderer.setExperimental`: a reversible switch the engine owns, off by default, whose off state is the
 * original's. A system is engine code (a `SystemFactory` the application registers); a pack only claims its slot by
 * name (H272: no uploaded code runs). The host owns every step: it installs, enables, schedules (`frame`), disables,
 * disposes and restores; a system gets a lease on its one seam and nothing else, and every install it made through
 * the lease is undone by the host when the system is disabled, ends or fails.
 */
import {
  checkHandlerClaim,
  diagnostic,
  ENGINE_CONTRACT_VERSION,
  EXTENSION_CODES,
  HANDLER_SLOTS,
  handlerCatalogue,
  PACK_CODES,
  type Diagnostic,
  type EngineHandler,
  type ExtensionEventType,
  type HandlerCatalogue,
  type PackHandlerClaim,
  type PackRef,
} from '@s2u/creator-contracts';
import type { VisualPostPass, VisualPostSeam } from '../../visualPostSeam';

export const EXTENSION_HOST_ADAPTATION =
  'engine-owned systems behind named seams, off by default; disabled, disposed or restored, every seam is back to its original state' as const;

/**
 * An engine system on the `visual.post` seam. `install` and `enable` may take time (and be cancelled); `disable` and
 * `dispose` are immediate. `install` runs again at an enable after a disable (the host undid the system's seam
 * installs at the disable), so it puts back what it installs and builds its own resources once.
 */
export interface VisualSystem {
  install(): void | Promise<void>;
  enable(): void | Promise<void>;
  disable(): void;
  dispose(): void;
  /** Called by the host, once a frame, only while the system is enabled; a system never runs a loop of its own. */
  frame?(dt: number): void;
}
/** Engine code: builds a system over its lease on the seam (the only thing it is given). */
export type SystemFactory = (seam: VisualPostSeam) => VisualSystem;

export type SystemState = 'registered' | 'installing' | 'enabled' | 'disabled' | 'disposed' | 'failed';
export interface Registration {
  readonly id: string;
  readonly pack: PackRef;
  readonly slot: string;
  readonly handler: string;
}
export interface SystemStatus extends Registration {
  readonly state: SystemState;
  /** `now()` when the state was entered. */
  readonly since: number;
  /** Why the system failed (state `failed`); empty otherwise. */
  readonly diagnostics: readonly Diagnostic[];
}
export interface ExtensionResult {
  readonly ok: boolean;
  readonly diagnostics: readonly Diagnostic[];
  readonly status?: SystemStatus;
}
export interface RestoreResult {
  readonly ok: boolean;
  readonly diagnostics: readonly Diagnostic[];
  readonly status: readonly SystemStatus[];
}
export interface ExtensionEvent {
  readonly type: ExtensionEventType;
  readonly at: number;
  /** The registration; absent for `restored` (the whole host). */
  readonly id?: string;
  readonly status?: SystemStatus;
  readonly diagnostics?: readonly Diagnostic[];
}
export interface ExtensionHostOptions {
  /** The seams the application claimed, by slot id: `visualPostSeams(renderer)` (`../../visualPostSeam`), the renderer's one claim. */
  readonly seams: Readonly<Record<string, VisualPostSeam | undefined>>;
  /** The engine handlers the application offers on those slots (none by default). */
  readonly handlers?: readonly EngineHandler[];
  readonly now?: () => number;
  /** The engine contract version the catalogue publishes (`ENGINE_CONTRACT_VERSION` by default). */
  readonly contract?: string;
}
export interface ExtensionHost {
  catalogue(): HandlerCatalogue;
  /**
   * Checks the claim (`checkHandlerClaim`), the slot's seam and its exclusivity; registers without installing anything.
   * A claim's `options` are not the host's: the application gave them to the handler for `system` (`systemForClaim`).
   */
  register(pack: PackRef, claim: PackHandlerClaim, system: SystemFactory): Registration | Diagnostic[];
  /**
   * Installs and enables: a fresh instance from the factory on the first enable and after `disposed` or `failed`; after
   * `disabled`, the same instance's `install` again (the host cleared its seam at the disable), then its `enable`.
   * `by`: the asking pack, refused unless the owner.
   */
  enable(id: string, signal?: AbortSignal, by?: string): Promise<ExtensionResult>;
  disable(id: string, by?: string): Promise<ExtensionResult>;
  /** Ends the system's instance; the registration stays and a later `enable` is explicit. */
  dispose(id: string, by?: string): Promise<ExtensionResult>;
  /** Ends the system and removes the registration, freeing its slot. */
  unregister(id: string, by?: string): Promise<ExtensionResult>;
  /** Every system off and every seam back to its original state; registrations are kept. */
  restore(): Promise<RestoreResult>;
  status(): SystemStatus[];
  subscribe(fn: (event: ExtensionEvent) => void): () => void;
  /** The engine's frame: each enabled system's `frame(dt)`, nothing else. */
  frame(dt: number): void;
  /** Before the world changes: every system disabled and disposed, synchronously; enables in flight are cancelled. */
  onMapSwitch(): void;
  /** The host's teardown: every system ended, the registrations dropped, every later call refused. */
  dispose(): void;
}

/** An engine handler that builds its system from options (the tint's `visualTintHandler`); it checks their content. */
export interface OptionedHandler {
  system(options: unknown): SystemFactory | Diagnostic[];
}

/**
 * The application's composition of a pack's claim (LATER 458; a browser adaptation, `EXTENSION_HOST_ADAPTATION`): the
 * handler's system from the claim's own `options` when the claim carries them -- a refusal of them stays that refusal,
 * the defaults never stand in -- and from the application's `defaults` only when it carries none. The contract bounded
 * the options' shape (`validatePack`); their content is the handler's to check. The result goes to `register`.
 */
export function systemForClaim(handler: OptionedHandler, claim: PackHandlerClaim, defaults?: unknown): SystemFactory | Diagnostic[] {
  return handler.system(claim.options !== undefined ? claim.options : defaults);
}

interface Lease {
  readonly view: VisualPostSeam;
  /** Undo every install made through the lease, keeping it usable (a disabled system re-installs at its enable). */
  clear(): void;
  /** Undo every install and refuse any later one. */
  release(): void;
}
function lease(seam: VisualPostSeam): Lease {
  const held: { off: () => void; done: boolean }[] = [];
  let dead = false;
  const clear = (): void => {
    for (const rec of held.splice(0).reverse()) {
      if (rec.done) continue;
      rec.done = true;
      try { rec.off(); } catch { /* The seam's own uninstall; nothing else can restore it. */ }
    }
  };
  const view: VisualPostSeam = Object.freeze({
    install(pass: VisualPostPass) {
      if (dead) throw new Error('This system no longer holds the seam.');
      const rec = { off: seam.install(pass), done: false };
      held.push(rec);
      return () => { if (rec.done) return; rec.done = true; rec.off(); };
    },
    snapshot: () => seam.snapshot(),
  });
  return { view, clear, release: () => { dead = true; clear(); } };
}

interface Entry {
  readonly reg: Registration;
  readonly factory: SystemFactory;
  readonly seam: VisualPostSeam;
  state: SystemState;
  since: number;
  diagnostics: readonly Diagnostic[];
  instance: VisualSystem | null;
  lease: Lease | null;
  /** Bumped whenever the instance ends: an enable that resumes under a newer generation does nothing more. */
  gen: number;
  cancel: AbortController | null;
}

const ABORT = Symbol('aborted');
/** `value`, or a rejection with `ABORT` as soon as `signal` aborts. */
function settle(value: void | Promise<void>, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) { reject(ABORT); return; }
    const on = (): void => reject(ABORT);
    signal.addEventListener('abort', on, { once: true });
    Promise.resolve(value).then(
      () => { signal.removeEventListener('abort', on); resolve(); },
      (error: unknown) => { signal.removeEventListener('abort', on); reject(error); },
    );
  });
}
/** A hook's call, its synchronous throw as a rejection. */
function call(hook: () => void | Promise<void>): Promise<void> | void {
  try { return hook(); } catch (error) { return Promise.reject(error); }
}
const message = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export function createExtensionHost(options: ExtensionHostOptions): ExtensionHost {
  const now = options.now ?? (() => Date.now());
  const caps = handlerCatalogue(options.handlers ?? []);
  const published: HandlerCatalogue = Object.freeze({ contract: options.contract ?? ENGINE_CONTRACT_VERSION, slots: HANDLER_SLOTS, handlers: Object.freeze(caps) });
  const entries = new Map<string, Entry>();
  const listeners = new Set<(event: ExtensionEvent) => void>();
  let closed = false;
  /** Bumped by a map switch, a restore and the teardown: an enable asked before one is cancelled. */
  let epoch = 0;
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const run = chain.then(task, task);
    chain = run.catch(() => undefined);
    return run;
  };

  const statusOf = (e: Entry): SystemStatus => Object.freeze({ ...e.reg, state: e.state, since: e.since, diagnostics: e.diagnostics });
  const set = (e: Entry, state: SystemState, diagnostics: readonly Diagnostic[] = []): void => {
    e.state = state; e.since = now(); e.diagnostics = Object.freeze([...diagnostics]);
  };
  const emit = (type: ExtensionEventType, e?: Entry, diagnostics?: readonly Diagnostic[]): void => {
    const event: ExtensionEvent = Object.freeze({ type, at: now(), ...(e ? { id: e.reg.id, status: statusOf(e) } : {}), ...(diagnostics ? { diagnostics } : {}) });
    for (const fn of [...listeners]) { try { fn(event); } catch { /* A listener's failure is its own. */ } }
  };
  const refusal = (code: string, text: string, id?: string): Diagnostic => diagnostic({ source: 'pack', severity: 'error', code, text, id });
  const failure = (e: Entry, step: string, error: unknown): Diagnostic => diagnostic({
    source: 'pack', severity: 'error', code: EXTENSION_CODES.systemFailed,
    text: `${e.reg.handler} failed at ${step}; it was rolled back.`, field: step, actual: message(error),
  });
  const aborted = (e: Entry): Diagnostic => refusal(EXTENSION_CODES.systemAborted, `Enabling ${e.reg.handler} was cancelled; nothing of it is left.`);
  const refused = (d: Diagnostic, e?: Entry): ExtensionResult => ({ ok: false, diagnostics: [d], ...(e ? { status: statusOf(e) } : {}) });
  const ok = (e: Entry): ExtensionResult => ({ ok: true, diagnostics: [], status: statusOf(e) });

  /**
   * The one way an instance ends, synchronously: an enable in flight cancelled, the system disabled (if it was
   * enabled and `disabled` is not already known) and disposed, every seam install it made undone. With a `cause`
   * it is a rollback (state `failed`, event `failed`); otherwise `disposed`, or `failed` if a hook threw.
   */
  const end = (e: Entry, cause: Diagnostic | null, disabled = false): Diagnostic[] => {
    e.gen++;
    const ac = e.cancel;
    e.cancel = null;
    ac?.abort();
    const inst = e.instance, wasEnabled = e.state === 'enabled' && !disabled;
    const problems: Diagnostic[] = cause ? [cause] : [];
    if (inst) {
      if (wasEnabled) { try { inst.disable(); } catch (error) { if (!cause) problems.push(failure(e, 'disable', error)); } }
      try { inst.dispose(); } catch (error) { if (!cause) problems.push(failure(e, 'dispose', error)); }
    }
    e.lease?.release();
    e.lease = null;
    e.instance = null;
    if (problems.length) { set(e, 'failed', problems); emit('failed', e, problems); return problems; }
    if (wasEnabled) { set(e, 'disabled'); emit('disabled', e); }
    set(e, 'disposed');
    emit('disposed', e);
    return [];
  };
  const live = (e: Entry): boolean => e.instance !== null || e.state === 'installing';
  const find = (id: string, by: string | undefined): Entry | Diagnostic => {
    if (closed) return refusal(EXTENSION_CODES.hostDisposed, 'The extension host has been torn down.');
    const e = typeof id === 'string' ? entries.get(id) : undefined;
    if (!e) return refusal(EXTENSION_CODES.systemUnknown, `No system is registered as ${String(id)}.`);
    if (by !== undefined && by !== e.reg.pack.id) return refusal(EXTENSION_CODES.ownership, `${e.reg.id} belongs to ${e.reg.pack.id}, not ${by}.`);
    return e;
  };
  const isEntry = (x: Entry | Diagnostic): x is Entry => (x as Entry).reg !== undefined;

  const enableTask = async (e: Entry, signal: AbortSignal | undefined, asked: number): Promise<ExtensionResult> => {
    if (closed) return refused(refusal(EXTENSION_CODES.hostDisposed, 'The extension host has been torn down.'));
    if (entries.get(e.reg.id) !== e) return refused(refusal(EXTENSION_CODES.systemUnknown, `No system is registered as ${e.reg.id}.`));
    if (asked !== epoch || signal?.aborted) return refused(aborted(e), e);
    if (e.state === 'enabled') return ok(e);
    const ac = new AbortController();
    e.cancel = ac;
    const forward = (): void => ac.abort();
    signal?.addEventListener('abort', forward, { once: true });
    const gen = e.gen;
    const stop = (step: string, error: unknown): ExtensionResult => {
      if (gen !== e.gen) return refused(aborted(e), e);   // already ended (a map switch, a restore, the teardown)
      end(e, error === ABORT ? aborted(e) : failure(e, step, error));
      return { ok: false, diagnostics: e.diagnostics, status: statusOf(e) };
    };
    try {
      // A disabled system keeps its instance and its lease, but the host cleared the lease at its disable, so whatever
      // it put on the seam at install is gone: its install runs again, under this enable's own signal (B2-1).
      const fresh = e.state !== 'disabled';
      if (fresh) {
        const held = lease(e.seam);
        e.lease = held;
        set(e, 'installing');
        try { e.instance = e.factory(held.view); } catch (error) { return stop('factory', error); }
      } else set(e, 'installing');
      const inst = e.instance!;
      try { await settle(call(() => inst.install()), ac.signal); } catch (error) { return stop('install', error); }
      if (gen !== e.gen) return refused(aborted(e), e);
      if (fresh) emit('installed', e);   // one `installed` an instance; its re-install belongs to the `enabled` that follows
      try { await settle(call(() => inst.enable()), ac.signal); } catch (error) { return stop('enable', error); }
      if (gen !== e.gen) return refused(aborted(e), e);
      set(e, 'enabled');
      emit('enabled', e);
      return ok(e);
    } finally {
      signal?.removeEventListener('abort', forward);
      if (e.cancel === ac) e.cancel = null;
    }
  };

  const disposeOne = (id: string, by?: string): Promise<ExtensionResult> => {
    const found = find(id, by);
    if (!isEntry(found)) return Promise.resolve(refused(found));
    return serial(async () => {
      if (entries.get(found.reg.id) !== found) return refused(refusal(EXTENSION_CODES.systemUnknown, `No system is registered as ${id}.`));
      const problems = end(found, null);
      return problems.length ? { ok: false, diagnostics: problems, status: statusOf(found) } : ok(found);
    });
  };
  const teardown = (): void => {
    if (closed) return;
    epoch++;
    for (const e of [...entries.values()]) if (live(e)) end(e, null);
    closed = true;
    entries.clear();
    listeners.clear();
  };

  const host: ExtensionHost = {
    catalogue: () => published,
    register(pack, claim, factory) {
      if (closed) return [refusal(EXTENSION_CODES.hostDisposed, 'The extension host has been torn down.')];
      const claimed: Record<string, string> = {};
      for (const e of entries.values()) claimed[e.reg.slot] ??= e.reg.pack.id;
      const found = checkHandlerClaim(claim, caps, claimed, { pack: pack.id });
      if (found.length) return found;
      const id = `${pack.id}/${claim.slot}`;
      if (entries.has(id)) return [diagnostic({ source: 'pack', severity: 'error', code: PACK_CODES.handlerConflict, text: `${pack.id} already holds slot ${claim.slot}.`, field: 'slot', expected: 'a free slot', actual: pack.id })];
      const seam = options.seams[claim.slot];
      if (!seam) return [refusal(EXTENSION_CODES.seamMissing, `The application gave no seam for slot ${claim.slot}.`)];
      const reg: Registration = Object.freeze({ id, pack: Object.freeze({ ...pack }), slot: claim.slot, handler: claim.handler });
      entries.set(id, { reg, factory, seam, state: 'registered', since: now(), diagnostics: [], instance: null, lease: null, gen: 0, cancel: null });
      return reg;
    },
    enable(id, signal, by) {
      const found = find(id, by);
      if (!isEntry(found)) return Promise.resolve(refused(found));
      const asked = epoch;
      return serial(() => enableTask(found, signal, asked));
    },
    disable(id, by) {
      const found = find(id, by);
      if (!isEntry(found)) return Promise.resolve(refused(found));
      return serial(async () => {
        if (entries.get(found.reg.id) !== found) return refused(refusal(EXTENSION_CODES.systemUnknown, `No system is registered as ${id}.`));
        if (found.state !== 'enabled') return ok(found);
        const inst = found.instance!;
        try { inst.disable(); } catch (error) {
          end(found, failure(found, 'disable', error), true);
          return { ok: false, diagnostics: found.diagnostics, status: statusOf(found) };
        }
        found.lease?.clear();   // disabled: the seam is the original's, whatever the system left
        set(found, 'disabled');
        emit('disabled', found);
        return ok(found);
      });
    },
    dispose: ((...args: [] | [string, string?]) => (args.length === 0 ? teardown() : disposeOne(args[0], args[1]))) as ExtensionHost['dispose'],
    unregister(id, by) {
      const found = find(id, by);
      if (!isEntry(found)) return Promise.resolve(refused(found));
      return serial(async () => {
        const problems = live(found) ? end(found, null) : [];
        entries.delete(found.reg.id);
        return { ok: problems.length === 0, diagnostics: problems, status: statusOf(found) };
      });
    },
    restore() {
      if (closed) return Promise.resolve({ ok: false, diagnostics: [refusal(EXTENSION_CODES.hostDisposed, 'The extension host has been torn down.')], status: [] });
      epoch++;
      const problems: Diagnostic[] = [];
      for (const e of [...entries.values()]) if (live(e)) problems.push(...end(e, null));
      emit('restored', undefined, problems);
      return Promise.resolve({ ok: problems.length === 0, diagnostics: problems, status: host.status() });
    },
    status: () => [...entries.values()].map(statusOf),
    subscribe(fn) {
      if (closed) return () => undefined;
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
    frame(dt) {
      if (closed) return;
      for (const e of [...entries.values()]) {
        if (e.state !== 'enabled' || !e.instance?.frame) continue;
        try { e.instance.frame(dt); } catch (error) { end(e, failure(e, 'frame', error)); }
      }
    },
    onMapSwitch() {
      if (closed) return;
      epoch++;
      for (const e of [...entries.values()]) if (live(e)) end(e, null);
    },
  };
  return host;
}
