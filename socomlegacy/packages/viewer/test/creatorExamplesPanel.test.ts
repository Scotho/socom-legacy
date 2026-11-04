// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createExamplesPanel, examplesForgePanel } from '../src/creator/examplesPanel';
import { previewStarter, type StarterContext, type StarterId } from '../src/creator/examples';
import { createForgeAgentApi, type ForgeAgentActionResult, type ForgeAgentApi, type ForgeAgentSnapshot } from '../src/forge/agent/api';
import type { ForgePanelContext } from '../src/forge/shell/context';
import { emptyLayout } from '../src/forge/layout';
import { recordOfLayout } from '../src/forge/record';
import { floorGround } from '../src/forge/ground';
import type { LoadedMap } from '../src/loadMap';

function loaded(): StarterContext {
  return { revision: 7, assets: [], archives: [{ stem: 'MP2', label: 'Frostfire', campaign: false }],
    map: { archive: 'MP2', ground: floorGround(2000), slots: [
      { side: 0, index: 0, position: [-100, 0, 0], facing: [0, -1] },
      { side: 1, index: 0, position: [100, 0, 0], facing: [0, 1] },
    ] } as unknown as LoadedMap };
}

/** Mounted-panel regression rig: the actual facade retains its normal readiness/Play/revision admission. */
function mountedStarter(initialReady = true) {
  let ready = initialReady, mode: ForgeAgentSnapshot['mode'] = 'forge-editor', canEdit = true;
  let previewGate = Promise.resolve(), previews = 0, applies = 0;
  const source = loaded(), pending: Promise<ForgeAgentActionResult>[] = [];
  const api = createForgeAgentApi({
    snapshot: () => ({ ready, mode, revision: 7,
      layout: recordOfLayout(emptyLayout({ kind: 'blank', library: 'floor' }), 'Mounted fixture'),
      selection: [], refs: [], catalogue: {}, issues: [], view: {}, canUndo: false, canRedo: false }),
    prepare: async (operation, args) => {
      if (operation === 'starters.preview') {
        await previewGate;
        return { commit: async () => { previews++; return previewStarter(args['id'] as StarterId, source); }, dispose: () => undefined };
      }
      if (operation === 'starters.apply') return { commit: () => { applies++; }, dispose: () => undefined };
      throw new Error(`Unexpected operation ${operation}`);
    },
  });
  const execute = vi.fn<ForgeAgentApi['execute']>((...args) => {
    const result = api.execute(...args); pending.push(result); return result;
  });
  const lifetime = new AbortController(), host = document.createElement('details'); host.open = true;
  document.body.append(host);
  const context: ForgePanelContext = {
    forge: { ...api, execute }, doc: document, signal: lifetime.signal,
    state: () => ({ surface: mode === 'blocked' ? 'blocked' : mode === 'forge-editor' ? 'build' : 'play',
      canEdit, canPlace: canEdit, reason: canEdit ? null : 'Stop Play to edit', revision: 7 }),
    store: { get: () => null, set: () => undefined },
    ui: {
      notify: () => ({ id: 0, dismiss: () => undefined }), toast: () => undefined,
      reveal: () => undefined, collapse: () => undefined,
      open: () => { throw new Error('This test opens no cards'); },
      focus: { take: () => () => undefined, holder: () => null },
      accepted: () => undefined, refused: () => undefined, pulse: () => undefined,
      registerStatusChip: () => ({ update: () => undefined, remove: () => undefined }),
    },
  };
  const getContext = vi.fn(() => source);
  const panel = examplesForgePanel(getContext).mount(host, context);
  return {
    host, panel, lifetime, execute, getContext,
    preview: () => host.querySelector<HTMLButtonElement>('[data-starter-id="static-mood"]')!,
    apply: () => host.querySelector<HTMLButtonElement>('[data-apply-starter]')!,
    setReady: (value: boolean) => { ready = value; },
    setMode: (value: typeof mode) => { mode = value; canEdit = value === 'forge-editor'; },
    setEditable: (value: boolean) => { canEdit = value; },
    waitForPreview: (promise: Promise<void>) => { previewGate = promise; },
    previews: () => previews, applies: () => applies,
    async finishRequests() { await Promise.all(pending); await Promise.resolve(); await Promise.resolve(); },
    dispose() { panel.dispose(); lifetime.abort(); api.dispose(); host.remove(); },
  };
}

describe('creator starter panel adaptation', () => {
  it('discovers six starters, previews without writing, and explains missing prerequisites', async () => {
    const execute = vi.fn(), getContext = vi.fn(async () => ({ revision: 1, map: null, assets: [], archives: [] }) as StarterContext);
    const panel = createExamplesPanel(document, { getContext, read: () => ({ revision: 1, ready: true, mode: 'forge-editor' }), execute, onClose: vi.fn() });
    document.body.append(panel);
    expect(panel.querySelectorAll('[data-starter-id]')).toHaveLength(6);
    const button = panel.querySelector<HTMLButtonElement>('[data-starter-id="arena"]')!;
    button.click(); await vi.waitFor(() => expect(panel.querySelector('[role="status"]')!.textContent).toContain('Load a map from your own source'));
    expect(panel.querySelector('[role="status"]')!.textContent).not.toContain('MAP_UNAVAILABLE');
    const details = panel.querySelector('details')!;
    expect(details.open).toBe(false); expect(details.querySelector('summary')!.textContent).toBe('Recipe details');
    expect(details.textContent).toContain('MAP_UNAVAILABLE');
    expect(execute).not.toHaveBeenCalled();
    expect(panel.querySelector<HTMLButtonElement>('[data-apply-starter]')!.disabled).toBe(true);
    expect(panel.textContent).toContain('Browser adaptation');
  });
  it('contains errors from asynchronous context reads and never enables Apply', async () => {
    const panel = createExamplesPanel(document, { getContext: async () => { throw new Error('Source unavailable'); }, read: () => ({ revision: 1, ready: true, mode: 'forge-editor' }), execute: vi.fn(), onClose: vi.fn() });
    panel.querySelector<HTMLButtonElement>('[data-starter-id]')!.click();
    await vi.waitFor(() => expect(panel.textContent).toContain('Source unavailable'));
    expect(panel.querySelector<HTMLButtonElement>('[data-apply-starter]')!.disabled).toBe(true);
  });
  it('requires a fresh visual inspection when the selected tree changes', async () => {
    const context = loaded();
    context.assets = ['one', 'two'].map(ref => ({ ref, asset: `MP2:${ref}`, collision: { state: 'available' }, geometry: { parts: 1 } })) as StarterContext['assets'];
    const panel = createExamplesPanel(document, { getContext: () => context, read: () => ({ revision: 7, ready: true, mode: 'forge-editor' }), execute: vi.fn(), onClose: vi.fn() });
    panel.querySelector<HTMLButtonElement>('[data-starter-id="static-mood"]')!.click();
    await vi.waitFor(() => expect(panel.querySelectorAll('select')).toHaveLength(3));
    const select = panel.querySelectorAll('select')[2]!, checkbox = panel.querySelector<HTMLInputElement>('input[type=checkbox]')!;
    select.value = 'one'; select.dispatchEvent(new Event('change')); checkbox.click(); expect(checkbox.checked).toBe(true);
    select.value = 'two'; select.dispatchEvent(new Event('change')); expect(checkbox.checked).toBe(false);
  });
  it('applies only after the explicit click and uses the existing revision-bound importer', async () => {
    const execute = vi.fn(async () => ({ ok: true, revision: 8 }));
    const panel = createExamplesPanel(document, { getContext: loaded, read: () => ({ revision: 7, ready: true, mode: 'forge-editor' }), execute, onClose: vi.fn() });
    panel.querySelector<HTMLButtonElement>('[data-starter-id="static-mood"]')!.click();
    const apply = panel.querySelector<HTMLButtonElement>('[data-apply-starter]')!;
    await vi.waitFor(() => expect(apply.disabled).toBe(false));
    expect(execute).not.toHaveBeenCalled();
    apply.click();
    await vi.waitFor(() => expect(panel.textContent).toContain('Starter applied'));
    expect(execute).toHaveBeenCalledWith('layout.import', expect.objectContaining({ layout: expect.objectContaining({ schema: 'forge-layout', version: 3, name: 'Static dusk settings' }) }), 7);
    expect(execute).toHaveBeenCalledTimes(1); expect(apply.disabled).toBe(true);
  });
  it('preserves intervening human edits and shows denied import errors', async () => {
    let revision = 7;
    const execute = vi.fn(async () => ({ ok: false, revision, code: 'DENIED', message: 'Import permission refused' }));
    const panel = createExamplesPanel(document, { getContext: loaded, read: () => ({ revision, ready: true, mode: 'forge-editor' }), execute, onClose: vi.fn() });
    const plan = panel.querySelector<HTMLButtonElement>('[data-starter-id="static-mood"]')!, apply = panel.querySelector<HTMLButtonElement>('[data-apply-starter]')!;
    plan.click(); await vi.waitFor(() => expect(apply.disabled).toBe(false));
    revision = 8; apply.click();
    await vi.waitFor(() => expect(panel.querySelector('[role="status"]')!.textContent).toContain('The editor changed'));
    expect(execute).not.toHaveBeenCalled();
    revision = 7; plan.click(); await vi.waitFor(() => expect(apply.disabled).toBe(false)); apply.click();
    await vi.waitFor(() => expect(panel.querySelector('[role="status"]')!.textContent).toBe('Import permission refused'));
    expect(apply.disabled).toBe(true);
  });
});

describe('mounted starter readiness and preview lifetime', () => {
  it('keeps Preview disabled during loading and allows a fresh valid preview after the existing update hook reports ready', async () => {
    const r = mountedStarter(false);
    try {
      expect(r.host.querySelectorAll('[data-starter-id]')).toHaveLength(6);
      expect([...r.host.querySelectorAll<HTMLButtonElement>('[data-starter-id]')].every(button => button.disabled)).toBe(true);
      r.preview().click();
      expect(r.getContext).not.toHaveBeenCalled();
      expect(r.execute).not.toHaveBeenCalled();
      expect(r.apply().disabled).toBe(true);
      r.setReady(true); r.panel.update?.();
      expect(r.preview().disabled).toBe(false);
      r.preview().click();
      await vi.waitFor(() => expect(r.apply().disabled).toBe(false));
      expect(r.host.querySelector('[role="status"]')!.textContent).toContain('ready to apply');
      expect(r.previews()).toBe(1);
      expect(r.applies()).toBe(0);
    } finally { r.dispose(); }
  });

  it('invalidates a ready preview as soon as loading resumes, then requires a new preview after recovery', async () => {
    const r = mountedStarter();
    try {
      r.preview().click(); await vi.waitFor(() => expect(r.apply().disabled).toBe(false));
      r.setReady(false); r.panel.update?.();
      expect(r.preview().disabled).toBe(true);
      expect(r.apply().disabled).toBe(true);
      r.setReady(true); r.panel.update?.();
      expect(r.preview().disabled).toBe(false);
      expect(r.apply().disabled).toBe(true);
      r.preview().click(); await vi.waitFor(() => expect(r.apply().disabled).toBe(false));
      expect(r.previews()).toBe(2);
      expect(r.applies()).toBe(0);
    } finally { r.dispose(); }
  });

  it.each(['dispose', 'fold', 'abort'] as const)('a late preview cannot enable its old Apply button after %s', async (transition) => {
    const r = mountedStarter();
    let release!: () => void;
    r.waitForPreview(new Promise<void>(resolve => { release = resolve; }));
    try {
      const oldApply = r.apply();
      r.preview().click(); await vi.waitFor(() => expect(r.execute).toHaveBeenCalledTimes(1));
      if (transition === 'dispose') r.panel.dispose();
      else if (transition === 'fold') { r.host.open = false; r.panel.update?.(); }
      else r.lifetime.abort();
      release(); await r.finishRequests();
      expect(oldApply.disabled).toBe(true);
      oldApply.click(); await r.finishRequests();
      expect(r.applies()).toBe(0);
    } finally { release(); r.dispose(); }
  });

  it.each(['forge-play', 'blocked'] as const)('cannot revive a stale pending preview after %s and return to Build', async (mode) => {
    const r = mountedStarter();
    let release!: () => void;
    r.waitForPreview(new Promise<void>(resolve => { release = resolve; }));
    try {
      r.preview().click(); await vi.waitFor(() => expect(r.execute).toHaveBeenCalledTimes(1));
      r.setMode(mode); r.panel.update?.();
      expect(r.preview().disabled).toBe(true);
      r.setMode('forge-editor'); r.panel.update?.();
      release(); await r.finishRequests();
      expect(r.apply().disabled).toBe(true);
      const beforeFreshPreview = r.previews();
      r.preview().click(); await vi.waitFor(() => expect(r.apply().disabled).toBe(false));
      expect(r.previews()).toBe(beforeFreshPreview + 1);
      expect(r.applies()).toBe(0);
    } finally { release(); r.dispose(); }
  });

  it('honors the existing panel admission flag even when the facade still names the editor', () => {
    const r = mountedStarter();
    try {
      r.setEditable(false); r.panel.update?.();
      expect(r.preview().disabled).toBe(true);
      r.preview().click();
      expect(r.getContext).not.toHaveBeenCalled();
      expect(r.execute).not.toHaveBeenCalled();
      r.setEditable(true); r.panel.update?.();
      expect(r.preview().disabled).toBe(false);
    } finally { r.dispose(); }
  });
});
