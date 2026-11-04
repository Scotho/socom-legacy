import { describe, expect, it, vi } from 'vitest';
import { ASSET_DRAG_MIME, createAssetDrag, type AssetDragPrepared } from '../src/forge/assetDrag';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(finish => { resolve = finish; });
  return { promise, resolve };
}
function rig() {
  let revision = 1, blocked: string | null = null, source: object | null = {};
  const history: string[] = [];
  const commit = vi.fn(async () => { history.push('piece'); return true; });
  const dispose = vi.fn();
  const create = vi.fn(async (_asset: string, _point: unknown): Promise<AssetDragPrepared | null> => ({ commit, dispose }));
  const drag = createAssetDrag({ snapshot: () => ({ revision, blocked, source }), create });
  const point = { at: [10, 0, 20] as [number, number, number] };
  const begin = () => { const token = drag.begin('MP2:crate'); expect(token).toBeTypeOf('string'); return token!; };
  return { drag, begin, point, history, create, commit, dispose,
    change() { revision++; }, block() { blocked = 'Return to Build'; }, unload() { source = null; }, replace() { source = {}; } };
}

describe('private loaded-asset drag transaction adaptation', () => {
  it('uses a private one-use token and commits exactly one placement', async () => {
    const r = rig(), token = r.begin();
    expect(ASSET_DRAG_MIME).toBe('application/x-s2u-forge-asset');
    expect(token).not.toBe('MP2:crate');
    expect(await r.drag.drop(token, r.point)).toBe(true);
    expect(await r.drag.drop(token, r.point)).toBe(false);
    expect(r.history).toEqual(['piece']); expect(r.dispose).toHaveBeenCalledOnce();
  });
  it.each(['construction', 'commit'] as const)('refuses same-token replay while %s is pending', async phase => {
    const r = rig(), token = r.begin();
    const prepared = deferred<AssetDragPrepared | null>(), result = deferred<boolean>();
    r.commit.mockImplementation(async () => {
      const accepted = await result.promise;
      if (accepted) r.history.push('piece');
      return accepted;
    });
    if (phase === 'construction') r.create.mockReturnValueOnce(prepared.promise);
    const first = r.drag.drop(token, r.point);
    await Promise.resolve(); await Promise.resolve();
    expect(r.create).toHaveBeenCalledOnce();
    expect(r.commit).toHaveBeenCalledTimes(phase === 'construction' ? 0 : 1);
    const replay = r.drag.drop(token, r.point);
    await Promise.resolve(); await Promise.resolve();
    expect(r.create).toHaveBeenCalledOnce();
    expect(r.commit).toHaveBeenCalledTimes(phase === 'construction' ? 0 : 1);
    expect(await replay).toBe(false); expect(r.history).toEqual([]);
    prepared.resolve({ commit: r.commit, dispose: r.dispose }); result.resolve(true);
    expect(await first).toBe(true); expect(r.commit).toHaveBeenCalledOnce();
    expect(r.history).toEqual(['piece']); expect(r.dispose).toHaveBeenCalledOnce();
  });
  it('does not report accepted until asynchronous editor placement resolves', async () => {
    const r = rig(), result = deferred<boolean>();
    r.commit.mockImplementation(() => result.promise);
    let completed = false;
    const pending = r.drag.drop(r.begin(), r.point).then(value => { completed = true; return value; });
    await Promise.resolve(); await Promise.resolve();
    expect(r.commit).toHaveBeenCalledOnce(); expect(completed).toBe(false);
    result.resolve(true); expect(await pending).toBe(true); expect(r.dispose).toHaveBeenCalledOnce();
  });
  it.each(['refused', 'rejected'] as const)('never reports accepted after %s placement', async outcome => {
    const r = rig();
    if (outcome === 'refused') r.commit.mockResolvedValue(false);
    else r.commit.mockRejectedValue(new Error('PLACEMENT_REFUSED'));
    // A rejected operation may reject to the panel or return false; neither is accepted.
    const accepted = await r.drag.drop(r.begin(), r.point).catch(() => false);
    expect(accepted).toBe(false); expect(r.history).toEqual([]); expect(r.dispose).toHaveBeenCalledOnce();
  });
  it.each(['foreign', 'cancel', 'outside', 'stale', 'mode', 'unloaded', 'source'] as const)('refuses %s before construction', async kind => {
    const r = rig(), token = r.begin();
    if (kind === 'cancel') r.drag.cancel();
    if (kind === 'stale') r.change();
    if (kind === 'mode') r.block();
    if (kind === 'unloaded') r.unload();
    if (kind === 'source') r.replace();
    expect(await r.drag.drop(kind === 'foreign' ? 'MP2:crate' : token, kind === 'outside' ? null : r.point)).toBe(false);
    expect(r.create).not.toHaveBeenCalled(); expect(r.history).toEqual([]);
  });
  it.each(['revision', 'mode', 'cancel', 'source'] as const)('rechecks %s after asynchronous staging and releases the handle', async change => {
    const r = rig(), prepared = deferred<AssetDragPrepared | null>();
    r.create.mockReturnValueOnce(prepared.promise);
    const pending = r.drag.drop(r.begin(), r.point);
    expect(r.create).toHaveBeenCalledOnce();
    if (change === 'revision') r.change();
    if (change === 'mode') r.block();
    if (change === 'cancel') r.drag.cancel();
    if (change === 'source') r.replace();
    prepared.resolve({ commit: r.commit, dispose: r.dispose });
    expect(await pending).toBe(false); expect(r.commit).not.toHaveBeenCalled(); expect(r.dispose).toHaveBeenCalledOnce();
  });
  it('ordinary dragend preserves a pending admitted drop', async () => {
    const r = rig(), prepared = deferred<AssetDragPrepared | null>();
    r.create.mockReturnValueOnce(prepared.promise);
    const pending = r.drag.drop(r.begin(), r.point); r.drag.end();
    prepared.resolve({ commit: r.commit, dispose: r.dispose });
    expect(await pending).toBe(true); expect(r.history).toHaveLength(1);
  });
  it.each([NaN, Infinity, -Infinity])('refuses a nonfinite point (%s) without construction', async bad => {
    const r = rig();
    expect(await r.drag.drop(r.begin(), { at: [bad, 0, 20] })).toBe(false);
    expect(r.create).not.toHaveBeenCalled();
  });
});
