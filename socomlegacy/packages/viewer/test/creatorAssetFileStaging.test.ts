// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountAssetFileStaging } from '../src/creator/assetFileStaging';
import type { LocalPackSummary } from '../src/agent/localPacks';
import type { LocalFile } from '../src/agent/localFiles';

afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });
function rig() {
  const host = document.createElement('section'); document.body.append(host);
  const abort = new AbortController(); let allowed = true;
  const stage = vi.fn(async (_files: readonly LocalFile[], _options?: { signal?: AbortSignal }): Promise<LocalPackSummary[]> => []);
  const importPack = vi.fn(), apply = vi.fn(), refreshMetadata = vi.fn();
  const packs = { stage, import: importPack, apply };
  const feature = mountAssetFileStaging(host, { packs, allowed: () => allowed, refresh: refreshMetadata, signal: abort.signal });
  const file = new File(['{}'], 'map.json');
  const root = () => { const zone = host.querySelector<HTMLElement>('[data-file-dropzone]'); expect(zone).not.toBeNull(); return zone!; };
  const drop = () => {
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'dataTransfer', { value: { types: ['Files'], files: [file], items: [] } }); root().dispatchEvent(event);
  };
  return { host, abort, stage, importPack, apply, refreshMetadata, feature, file, root, drop,
    block() { allowed = false; feature.refresh(); } };
}

describe('host-mounted local-file staging adaptation', () => {
  it('stages chosen files once, refreshes metadata, and never imports or applies', async () => {
    const r = rig(); r.drop();
    await vi.waitFor(() => expect(r.stage).toHaveBeenCalledOnce());
    expect(r.stage.mock.calls[0]![0]).toEqual([r.file]); expect(r.stage.mock.calls[0]![1]?.signal).toBeDefined();
    await vi.waitFor(() => expect(r.refreshMetadata).toHaveBeenCalledOnce());
    expect(r.importPack).not.toHaveBeenCalled(); expect(r.apply).not.toHaveBeenCalled();
    expect(r.host.textContent).toContain('not installed'); r.feature.dispose();
  });
  it('refuses a disabled drop without staging or importing', () => {
    const r = rig(); r.root(); r.block(); r.drop();
    expect(r.stage).not.toHaveBeenCalled(); expect(r.importPack).not.toHaveBeenCalled();
    expect(r.host.querySelector<HTMLInputElement>('input')!.disabled).toBe(true); r.feature.dispose();
  });
  it.each(['mode', 'document', 'abort', 'dispose'] as const)('aborts pending byte reads on %s and suppresses late metadata refresh', async reason => {
    const r = rig(); let signal!: AbortSignal;
    r.stage.mockImplementationOnce((_files, options) => new Promise((_resolve, reject) => {
      signal = options!.signal!; signal.addEventListener('abort', () => reject(new Error('READ_CANCELLED')), { once: true });
    }));
    r.drop(); expect(r.stage).toHaveBeenCalledOnce(); expect(signal.aborted).toBe(false);
    if (reason === 'mode') r.block();
    else if (reason === 'document') {
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden'); document.dispatchEvent(new Event('visibilitychange'));
    } else if (reason === 'abort') r.abort.abort(); else r.feature.dispose();
    expect(signal.aborted).toBe(true);
    await Promise.resolve(); await Promise.resolve();
    expect(r.refreshMetadata).not.toHaveBeenCalled(); expect(r.importPack).not.toHaveBeenCalled(); expect(r.apply).not.toHaveBeenCalled();
    r.feature.dispose();
  });
  it('uses the same staged API and cancellation signal for the chooser', async () => {
    const r = rig(); r.root();
    const input = r.host.querySelector<HTMLInputElement>('input[type=file]'); expect(input).not.toBeNull();
    Object.defineProperty(input!, 'files', { value: [r.file] }); input!.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(r.stage).toHaveBeenCalledOnce()); expect(r.stage.mock.calls[0]![1]?.signal).toBeDefined();
    expect(r.importPack).not.toHaveBeenCalled(); expect(r.apply).not.toHaveBeenCalled(); r.feature.dispose();
  });
  it('does not report cancellation when admission changes after the stage promise has already succeeded', async () => {
    const r = rig(); r.root();
    const status = r.root().querySelector<HTMLElement>('[role=status]')!;
    const writes: string[] = [], setter = Object.getOwnPropertyDescriptor(Node.prototype, 'textContent')!.set!;
    vi.spyOn(status, 'textContent', 'set').mockImplementation(value => { writes.push(value ?? ''); setter.call(status, value); });
    let finish!: (value: LocalPackSummary[]) => void;
    r.stage.mockImplementationOnce(() => new Promise<LocalPackSummary[]>(resolve => { finish = resolve; }));
    r.drop(); expect(r.stage).toHaveBeenCalledOnce();
    // LocalPackApi.stage has fulfilled: the bytes really are staged, even though its caller has not resumed yet.
    finish([{ id: 'staged:map', kind: 'map', name: 'map.json', files: 1, bytes: 2, staged: true,
      imported: false, stored: false, enabled: false, applied: false, diagnostics: [] }]); r.block();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(writes.some(message => /cancel/i.test(message))).toBe(false);
    expect(r.refreshMetadata).not.toHaveBeenCalled(); expect(r.importPack).not.toHaveBeenCalled(); expect(r.apply).not.toHaveBeenCalled();
    r.feature.dispose();
  });
});
