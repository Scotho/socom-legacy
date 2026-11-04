import { describe, expect, it, vi } from 'vitest';
import { Scene } from 'three';
import { ENGINE_CONTRACT_VERSION, EXTENSION_CODES, HANDLER_SLOTS, PACK_CODES, type Diagnostic, type PackRef } from '@s2u/creator-contracts';
import { createExtensionHost, systemForClaim, type ExtensionEvent, type SystemFactory, type VisualSystem } from '../../src/packs/systems/host';
import { createPostSlot, type VisualPostSeam } from '../../src/visualPostSeam';

const A: PackRef = { id: 'tint.pack', version: '1.0.0', hash: 'a'.repeat(64) };
const B: PackRef = { id: 'other.pack', version: '1.0.0', hash: 'b'.repeat(64) };
const CLAIM = { slot: 'visual.post', handler: 'visual.post.tint' };
const HANDLERS = [{ id: 'visual.post.tint', slot: 'visual.post' }];

/** The renderer's real post slot over a fixed draw configuration: what the host restores is the seam's own state. */
function world() {
  const slot = createPostSlot(() => ({ presentation: 'native', glowPasses: 0, experimenting: false }));
  const baseline = slot.seam.snapshot();
  return { slot, baseline, seams: { 'visual.post': slot.seam } };
}
type Hook = 'install' | 'enable' | 'disable' | 'dispose';
interface Spy extends VisualSystem { calls: string[]; frame: ReturnType<typeof vi.fn> }
/** A test system: its pass installed through the seam it is given at enable, removed at disable. */
function system(over: Partial<Record<Hook, () => void | Promise<void>>> = {}): { factory: SystemFactory; made: Spy[]; seams: VisualPostSeam[] } {
  const made: Spy[] = [], seams: VisualPostSeam[] = [];
  const factory: SystemFactory = (seam) => {
    seams.push(seam);
    let off: (() => void) | null = null;
    const calls: string[] = [];
    const s: Spy = {
      calls,
      install: () => { calls.push('install'); return over.install?.(); },
      enable: () => { calls.push('enable'); off = seam.install({ id: 'tint', scene: new Scene() }); return over.enable?.(); },
      disable: () => { calls.push('disable'); off?.(); off = null; void over.disable?.(); },
      dispose: () => { calls.push('dispose'); void over.dispose?.(); },
      frame: vi.fn(),
    };
    made.push(s);
    return s;
  };
  return { factory, made, seams };
}
const codes = (d: readonly Diagnostic[] | undefined): string[] => (d ?? []).map((x) => x.code);
const registered = (r: unknown): { id: string } => {
  if (Array.isArray(r)) throw new Error(`refused: ${codes(r as Diagnostic[]).join()}`);
  return r as { id: string };
};
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('the extension host: catalogue and claims', () => {
  it('publishes the frozen slots, the engine handlers and the engine contract', () => {
    const host = createExtensionHost({ seams: world().seams, handlers: HANDLERS });
    expect(host.catalogue()).toEqual({
      contract: ENGINE_CONTRACT_VERSION,
      slots: HANDLER_SLOTS,
      handlers: [{ id: 'visual.post.tint', slot: 'visual.post', actions: ['install', 'enable', 'disable', 'dispose'], exclusive: true }],
    });
    expect(createExtensionHost({ seams: {}, contract: '0.1.0' }).catalogue().handlers).toEqual([]);
  });
  it('refuses wrong capabilities through checkHandlerClaim', () => {
    const host = createExtensionHost({ seams: world().seams, handlers: HANDLERS });
    expect(codes(host.register(A, { slot: 'visual.post', handler: 'visual.post.bloom' }, system().factory) as Diagnostic[])).toEqual([PACK_CODES.handlerUnknown]);
    expect(codes(host.register(A, { slot: 'water.ocean', handler: 'visual.post.tint' }, system().factory) as Diagnostic[])).toEqual([PACK_CODES.handlerUnknown]);
    expect(codes(host.register(A, { ...CLAIM, actions: ['enable', 'eval'] }, system().factory) as Diagnostic[])).toEqual([PACK_CODES.actionUnknown]);
    expect(host.status()).toEqual([]);
  });
  it('refuses a slot the application gave no seam for', () => {
    const host = createExtensionHost({ seams: {}, handlers: HANDLERS });
    expect(codes(host.register(A, CLAIM, system().factory) as Diagnostic[])).toEqual([EXTENSION_CODES.seamMissing]);
  });
  it('refuses a duplicate claim on the exclusive slot, from another pack or the same one, and frees it on unregister', async () => {
    const host = createExtensionHost({ seams: world().seams, handlers: HANDLERS });
    const r = registered(host.register(A, CLAIM, system().factory));
    expect(codes(host.register(B, CLAIM, system().factory) as Diagnostic[])).toEqual([PACK_CODES.handlerConflict]);
    expect(codes(host.register(A, CLAIM, system().factory) as Diagnostic[])).toEqual([PACK_CODES.handlerConflict]);
    expect(codes((await host.unregister(r.id, B.id)).diagnostics)).toEqual([EXTENSION_CODES.ownership]);
    expect((await host.unregister(r.id)).ok).toBe(true);
    expect(Array.isArray(host.register(B, CLAIM, system().factory))).toBe(false);
  });
  it('takes a claim carrying options as it takes any claim; the registration does not carry them (LATER 458)', () => {
    const host = createExtensionHost({ seams: world().seams, handlers: HANDLERS });
    const reg = registered(host.register(A, { ...CLAIM, options: { colour: '#ff0000', strength: 0.5 } }, system().factory));
    expect(host.status().map((s) => ({ id: s.id, slot: s.slot, handler: s.handler }))).toEqual([{ id: reg.id, slot: 'visual.post', handler: 'visual.post.tint' }]);
    expect('options' in reg).toBe(false);
  });
});

describe('systemForClaim: a handler\'s system from a pack\'s claim (LATER 458, the application\'s composition)', () => {
  const made = system().factory;
  const handler = () => ({ system: vi.fn((_options: unknown): SystemFactory | Diagnostic[] => made) });
  it("hands the handler the claim's options when the claim carries them, the application's defaults never", () => {
    const h = handler();
    const options = Object.freeze({ colour: '#ff0000', strength: 0.5 });
    expect(systemForClaim(h, { ...CLAIM, options }, { colour: '00ff00', strength: 1 })).toBe(made);
    expect(h.system).toHaveBeenCalledTimes(1);
    expect(h.system.mock.calls[0]![0]).toBe(options);
  });
  it("hands the handler the application's defaults only when the claim carries no options", () => {
    const h = handler();
    const defaults = { colour: '00ff00', strength: 1 };
    systemForClaim(h, CLAIM, defaults);
    expect(h.system.mock.calls[0]![0]).toBe(defaults);
    systemForClaim(h, CLAIM);
    expect(h.system.mock.calls[1]![0]).toBeUndefined();
  });
  it("returns the handler's refusal as it is, never a throw", () => {
    const refusal = [{ source: 'pack', severity: 'error', code: 'visual.TINT_OPTION', text: 'no' }] as unknown as Diagnostic[];
    const h = { system: vi.fn(() => refusal) };
    expect(systemForClaim(h, { ...CLAIM, options: { colour: 'red' } })).toBe(refusal);
  });
});

describe('the extension host: lifecycle', () => {
  it('runs install -> enable -> disable -> dispose, the seam back to its original state', async () => {
    const w = world(), s = system(), events: ExtensionEvent[] = [];
    const host = createExtensionHost({ seams: w.seams, handlers: HANDLERS, now: () => 7 });
    host.subscribe((e) => events.push(e));
    const r = registered(host.register(A, CLAIM, s.factory));
    expect(host.status()).toMatchObject([{ id: r.id, pack: A, slot: 'visual.post', handler: 'visual.post.tint', state: 'registered' }]);
    expect(s.made).toHaveLength(0);
    const on = await host.enable(r.id);
    expect(on).toMatchObject({ ok: true, status: { state: 'enabled', since: 7 } });
    expect(s.made[0]!.calls).toEqual(['install', 'enable']);
    expect(w.slot.current()?.id).toBe('tint');
    expect((await host.disable(r.id)).status?.state).toBe('disabled');
    expect(w.slot.seam.snapshot()).toEqual(w.baseline);
    await host.enable(r.id);
    expect(s.made).toHaveLength(1);
    // Re-enabling a disabled system re-runs its install on the same instance (B2-1): the host cleared its lease.
    expect(s.made[0]!.calls).toEqual(['install', 'enable', 'disable', 'install', 'enable']);
    expect((await host.dispose(r.id)).status?.state).toBe('disposed');
    expect(s.made[0]!.calls).toEqual(['install', 'enable', 'disable', 'install', 'enable', 'disable', 'dispose']);
    expect(w.slot.seam.snapshot()).toEqual(w.baseline);
    expect(events.map((e) => e.type)).toEqual(['installed', 'enabled', 'disabled', 'enabled', 'disabled', 'disposed']);
    expect(events.every((e) => e.id === r.id && e.at === 7)).toBe(true);
    // Re-enabling a disposed system is explicit and makes a fresh instance.
    await host.enable(r.id);
    expect(s.made).toHaveLength(2);
  });
  it('enables again after a disable: install re-run, the pass back on the seam, the frame reached (B2-1)', async () => {
    const w = world(), events: ExtensionEvent[] = [], states: string[] = [], reached: (string | null)[] = [], calls: string[] = [];
    // As visualTint does: the pass goes on the seam at install, so a disable (the host clears the lease) takes it off.
    const factory: SystemFactory = (seam) => {
      let off: (() => void) | null = null;
      return {
        install: () => { calls.push('install'); off ??= seam.install({ id: 'tint', scene: new Scene() }); },
        enable: () => { calls.push('enable'); },
        disable: () => { calls.push('disable'); off?.(); off = null; },
        dispose: () => { calls.push('dispose'); off?.(); off = null; },
        frame: () => { reached.push(w.slot.current()?.id ?? null); },
      };
    };
    const host = createExtensionHost({ seams: w.seams, handlers: HANDLERS });
    host.subscribe((e) => events.push(e));
    const r = registered(host.register(A, CLAIM, factory));
    const state = (): void => { states.push(host.status()[0]!.state); };
    state();
    await host.enable(r.id); state();
    await host.disable(r.id); state();
    expect(w.slot.seam.snapshot()).toEqual(w.baseline);
    expect((await host.enable(r.id)).ok).toBe(true); state();
    host.frame(16);
    expect(reached).toEqual(['tint']);
    expect(w.slot.current()?.id).toBe('tint');
    await host.dispose(r.id); state();
    host.frame(16);
    expect(reached).toEqual(['tint']);
    expect(states).toEqual(['registered', 'enabled', 'disabled', 'enabled', 'disposed']);
    // A dispose from enabled reports the disable it makes, then the disposal (`end`).
    expect(events.map((e) => [e.type, e.status?.state])).toEqual([
      ['installed', 'installing'], ['enabled', 'enabled'], ['disabled', 'disabled'], ['enabled', 'enabled'], ['disabled', 'disabled'], ['disposed', 'disposed'],
    ]);
    expect(calls).toEqual(['install', 'enable', 'disable', 'install', 'enable', 'disable', 'dispose']);
    expect(w.slot.seam.snapshot()).toEqual(w.baseline);
  });
  it('keeps a dispose after a disable final: one disposal, no frame, a later disable does nothing', async () => {
    const w = world(), s = system(), events: string[] = [];
    const host = createExtensionHost({ seams: w.seams, handlers: HANDLERS });
    const r = registered(host.register(A, CLAIM, s.factory));
    await host.enable(r.id);
    await host.disable(r.id);
    host.subscribe((e) => events.push(e.type));
    expect((await host.dispose(r.id)).status?.state).toBe('disposed');
    expect((await host.disable(r.id)).status?.state).toBe('disposed');
    host.frame(16);
    expect(events).toEqual(['disposed']);
    expect(s.made[0]!.calls).toEqual(['install', 'enable', 'disable', 'dispose']);
    expect(s.made[0]!.frame).not.toHaveBeenCalled();
    expect(w.slot.seam.snapshot()).toEqual(w.baseline);
  });
  it('re-installs under a fresh signal: an abort during the re-install rolls the system back (B2-1)', async () => {
    const w = world();
    let finish: (() => void) | null = null, installs = 0;
    const s = system({ install: () => (++installs === 2 ? new Promise<void>((resolve) => { finish = resolve; }) : undefined) });
    const host = createExtensionHost({ seams: w.seams, handlers: HANDLERS });
    const r = registered(host.register(A, CLAIM, s.factory));
    await host.enable(r.id);
    await host.disable(r.id);
    const ac = new AbortController();
    const pending = host.enable(r.id, ac.signal);
    await tick();
    expect(installs).toBe(2);
    ac.abort();
    expect(codes((await pending).diagnostics)).toEqual([EXTENSION_CODES.systemAborted]);
    expect(host.status()[0]!.state).toBe('failed');
    finish!();
    await tick();
    expect(s.made[0]!.calls).toEqual(['install', 'enable', 'disable', 'install', 'dispose']);
    expect(w.slot.seam.snapshot()).toEqual(w.baseline);
  });
  it('gives the factory only its seam (engine-owned scheduling: no loop, no clock, no renderer)', async () => {
    const s = system();
    const host = createExtensionHost({ seams: world().seams, handlers: HANDLERS });
    await host.enable(registered(host.register(A, CLAIM, s.factory)).id);
    expect(Object.keys(s.seams[0]!).sort()).toEqual(['install', 'snapshot']);
  });
  it("refuses another pack's enable, disable and dispose (OWNERSHIP) and does no work", async () => {
    const s = system();
    const host = createExtensionHost({ seams: world().seams, handlers: HANDLERS });
    const r = registered(host.register(A, CLAIM, s.factory));
    expect(codes((await host.enable(r.id, undefined, B.id)).diagnostics)).toEqual([EXTENSION_CODES.ownership]);
    expect(s.made).toHaveLength(0);
    await host.enable(r.id, undefined, A.id);
    expect(codes((await host.disable(r.id, B.id)).diagnostics)).toEqual([EXTENSION_CODES.ownership]);
    expect(codes((await host.dispose(r.id, B.id)).diagnostics)).toEqual([EXTENSION_CODES.ownership]);
    expect(host.status()[0]!.state).toBe('enabled');
    expect(s.made[0]!.calls).toEqual(['install', 'enable']);
  });
  it('refuses an unknown registration', async () => {
    const host = createExtensionHost({ seams: world().seams, handlers: HANDLERS });
    expect(codes((await host.enable('nobody/visual.post')).diagnostics)).toEqual([EXTENSION_CODES.systemUnknown]);
  });
});

describe('the extension host: rollback', () => {
  it('rolls back a system whose install throws: failed with the diagnostic, the seam untouched', async () => {
    const w = world(), s = system({ install: () => { throw new Error('no pipeline'); } }), events: string[] = [];
    const host = createExtensionHost({ seams: w.seams, handlers: HANDLERS });
    host.subscribe((e) => events.push(e.type));
    const r = registered(host.register(A, CLAIM, s.factory));
    const out = await host.enable(r.id);
    expect(out.ok).toBe(false);
    expect(codes(out.diagnostics)).toEqual([EXTENSION_CODES.systemFailed]);
    expect(host.status()[0]).toMatchObject({ state: 'failed', diagnostics: [{ code: EXTENSION_CODES.systemFailed }] });
    expect(s.made[0]!.calls).toEqual(['install', 'dispose']);
    expect(w.slot.seam.snapshot()).toEqual(w.baseline);
    expect(events).toEqual(['failed']);
  });
  it('rolls back a system whose enable throws after installing its pass: the host uninstalls what the system left', async () => {
    const w = world(), s = system({ enable: () => { throw new Error('half'); }, dispose: () => { throw new Error('worse'); } });
    const host = createExtensionHost({ seams: w.seams, handlers: HANDLERS });
    const r = registered(host.register(A, CLAIM, s.factory));
    expect((await host.enable(r.id)).ok).toBe(false);
    expect(w.slot.current()).toBeNull();
    expect(w.slot.seam.snapshot()).toEqual(w.baseline);
    expect(host.status()[0]!.state).toBe('failed');
    expect(s.made).toHaveLength(1);
  });
  it('rolls back an enable whose signal aborts mid-install, and refuses the stale system the seam afterwards', async () => {
    const w = world();
    let finish!: () => void;
    const s = system({ install: () => new Promise<void>((resolve) => { finish = resolve; }) });
    const host = createExtensionHost({ seams: w.seams, handlers: HANDLERS });
    const r = registered(host.register(A, CLAIM, s.factory));
    const ac = new AbortController();
    const pending = host.enable(r.id, ac.signal);
    await tick();
    expect(s.made[0]!.calls).toEqual(['install']);
    ac.abort();
    const out = await pending;
    expect(codes(out.diagnostics)).toEqual([EXTENSION_CODES.systemAborted]);
    expect(host.status()[0]!.state).toBe('failed');
    finish();
    await tick();
    expect(s.made[0]!.calls).toEqual(['install', 'dispose']);
    expect(() => s.seams[0]!.install({ id: 'late', scene: new Scene() })).toThrow();
    expect(w.slot.seam.snapshot()).toEqual(w.baseline);
  });
  it('does nothing for a signal already aborted', async () => {
    const s = system();
    const host = createExtensionHost({ seams: world().seams, handlers: HANDLERS });
    const r = registered(host.register(A, CLAIM, s.factory));
    const ac = new AbortController();
    ac.abort();
    expect(codes((await host.enable(r.id, ac.signal)).diagnostics)).toEqual([EXTENSION_CODES.systemAborted]);
    expect(s.made).toHaveLength(0);
    expect(host.status()[0]!.state).toBe('registered');
  });
  it('rolls back a system whose disable throws, the seam restored', async () => {
    const w = world(), s = system({ disable: () => { throw new Error('stuck'); } });
    const host = createExtensionHost({ seams: w.seams, handlers: HANDLERS });
    const r = registered(host.register(A, CLAIM, s.factory));
    await host.enable(r.id);
    const out = await host.disable(r.id);
    expect(out.ok).toBe(false);
    expect(codes(out.diagnostics)).toEqual([EXTENSION_CODES.systemFailed]);
    expect(host.status()[0]!.state).toBe('failed');
    expect(w.slot.seam.snapshot()).toEqual(w.baseline);
  });
});

describe('the extension host: no off work, map switch, restore, teardown', () => {
  it('calls frame only while enabled', async () => {
    const s = system();
    const host = createExtensionHost({ seams: world().seams, handlers: HANDLERS });
    const r = registered(host.register(A, CLAIM, s.factory));
    host.frame(1 / 60);
    await host.enable(r.id);
    host.frame(1 / 60);
    host.frame(1 / 60);
    const spy = s.made[0]!.frame;
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith(1 / 60);
    await host.disable(r.id);
    host.frame(1 / 60);
    await host.dispose(r.id);
    host.frame(1 / 60);
    expect(spy).toHaveBeenCalledTimes(2);
  });
  it('rolls back a system whose frame throws, and never calls it again', async () => {
    const w = world(), s = system();
    const host = createExtensionHost({ seams: w.seams, handlers: HANDLERS });
    const r = registered(host.register(A, CLAIM, s.factory));
    await host.enable(r.id);
    s.made[0]!.frame.mockImplementation(() => { throw new Error('boom'); });
    host.frame(0.016);
    host.frame(0.016);
    expect(s.made[0]!.frame).toHaveBeenCalledTimes(1);
    expect(host.status()[0]!.state).toBe('failed');
    expect(w.slot.seam.snapshot()).toEqual(w.baseline);
  });
  it('disables and disposes every system synchronously at a map switch; re-enabling is explicit', async () => {
    const w = world(), s = system(), events: string[] = [];
    const host = createExtensionHost({ seams: w.seams, handlers: HANDLERS });
    const r = registered(host.register(A, CLAIM, s.factory));
    await host.enable(r.id);
    host.subscribe((e) => events.push(e.type));
    host.onMapSwitch();
    expect(s.made[0]!.calls).toEqual(['install', 'enable', 'disable', 'dispose']);
    expect(host.status()[0]!.state).toBe('disposed');
    expect(w.slot.seam.snapshot()).toEqual(w.baseline);
    expect(events).toEqual(['disabled', 'disposed']);
    host.frame(0.016);
    expect(s.made[0]!.frame).not.toHaveBeenCalled();
    await tick();
    expect(s.made).toHaveLength(1);
    expect((await host.enable(r.id)).ok).toBe(true);
    expect(s.made).toHaveLength(2);
  });
  it('aborts an enable in flight at a map switch, leaving no half state', async () => {
    const w = world();
    let finish!: () => void;
    const s = system({ install: () => new Promise<void>((resolve) => { finish = resolve; }) });
    const host = createExtensionHost({ seams: w.seams, handlers: HANDLERS });
    const r = registered(host.register(A, CLAIM, s.factory));
    const pending = host.enable(r.id);
    await tick();
    host.onMapSwitch();
    expect(host.status()[0]!.state).toBe('disposed');
    finish();
    const out = await pending;
    expect(codes(out.diagnostics)).toEqual([EXTENSION_CODES.systemAborted]);
    expect(host.status()[0]!.state).toBe('disposed');
    expect(s.made[0]!.calls).toEqual(['install', 'dispose']);
    expect(w.slot.seam.snapshot()).toEqual(w.baseline);
  });
  it('restores every system off and the original seam state, keeping the registrations', async () => {
    const w = world(), s = system(), events: string[] = [];
    const host = createExtensionHost({ seams: w.seams, handlers: HANDLERS });
    const r = registered(host.register(A, CLAIM, s.factory));
    await host.enable(r.id);
    host.subscribe((e) => events.push(e.type));
    const out = await host.restore();
    expect(out).toMatchObject({ ok: true, diagnostics: [] });
    expect(w.slot.seam.snapshot()).toEqual(w.baseline);
    expect(host.status()).toMatchObject([{ id: r.id, state: 'disposed' }]);
    expect(events).toEqual(['disabled', 'disposed', 'restored']);
  });
  it('tears down at dispose(): the seam restored, every later call refused, no event after', async () => {
    const w = world(), s = system(), events: string[] = [];
    const host = createExtensionHost({ seams: w.seams, handlers: HANDLERS });
    const r = registered(host.register(A, CLAIM, s.factory));
    await host.enable(r.id);
    host.subscribe((e) => events.push(e.type));
    host.dispose();
    expect(w.slot.seam.snapshot()).toEqual(w.baseline);
    expect(s.made[0]!.calls).toEqual(['install', 'enable', 'disable', 'dispose']);
    expect(host.status()).toEqual([]);
    const before = events.length;
    expect(codes((await host.enable(r.id)).diagnostics)).toEqual([EXTENSION_CODES.hostDisposed]);
    expect(codes(host.register(A, CLAIM, s.factory) as Diagnostic[])).toEqual([EXTENSION_CODES.hostDisposed]);
    host.frame(0.016);
    host.onMapSwitch();
    host.dispose();
    expect(events.length).toBe(before);
  });
  it('keeps going when a listener throws, and unsubscribes', async () => {
    const host = createExtensionHost({ seams: world().seams, handlers: HANDLERS });
    const seen: string[] = [];
    host.subscribe(() => { throw new Error('listener'); });
    const off = host.subscribe((e) => seen.push(e.type));
    const r = registered(host.register(A, CLAIM, system().factory));
    expect((await host.enable(r.id)).ok).toBe(true);
    off();
    await host.disable(r.id);
    expect(seen).toEqual(['installed', 'enabled']);
  });
});
