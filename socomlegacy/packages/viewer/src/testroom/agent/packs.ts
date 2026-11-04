import { LocalPackError, type LocalPackOptions, type LocalTextureContext } from '../../agent/localPacks';
import type { ModPanel } from '../../mods/panel';
import type { LocalTexturePacks } from '../../texturePackRuntime';
import { modelPackActive } from '../../modelPack';
import { modelPackSlotInstalled } from '../../modelPackRuntime';

/** Browser adaptation: only existing typed runtimes receive validated, browser-local pack data. */
export interface LiveLocalPackDeps {
  allowed(): boolean;
  modPanel(): ModPanel | null;
  texturePacks(): LocalTexturePacks | null;
  textureContext(): Promise<LocalTextureContext>;
  modelAddress(): string;
  modelBase?: string;
  modelsEnabled?(on: boolean): void;
  /** Resolve only when the actual loader has finished rebuilding the current map. */
  reload(signal: AbortSignal): Promise<void>;
}

export function createLiveLocalPackDrivers(deps: LiveLocalPackDeps): LocalPackOptions {
  const allowed = () => { try { return deps.allowed() === true; } catch { return false; } };
  const check = (signal?: AbortSignal): void => {
    if (signal?.aborted) throw new LocalPackError('ABORTED', 'The local pack request was cancelled.');
    if (!allowed()) throw new LocalPackError('UNSUPPORTED_SURFACE', 'Local pack edits require the solo test room in Build.');
  };
  const missing = (): never => { throw new LocalPackError('UNSUPPORTED_SURFACE', 'The current test room has no live pack target.'); };
  return {
    allowedSurface: (kind) => kind !== 'map' && allowed(),
    isApplied(kind, id) {
      if (kind === 'model') return id === 'model:current' && modelPackSlotInstalled('primary');
      if (kind === 'mod') return id.startsWith('mod:') && deps.modPanel()?.isApplied(id.slice(4)) === true;
      if (kind === 'texture') {
        const match = /^texture:([^:]+):([^:]+)$/.exec(id);
        return !!match && deps.texturePacks()?.isApplied(match[1]!, match[2]!) === true;
      }
      return false;
    },
    async applyMod(pack, manifest, signal) {
      check(signal);
      const panel = deps.modPanel() ?? missing();
      await panel.activateStored(pack, manifest, () => !signal.aborted && allowed());
      check(signal);
      await deps.reload(signal);
      check(signal);
    },
    async applyModel(pack, signal) {
      check(signal);
      const runtime = await import('../../modelPackRuntime');
      check(signal);
      deps.modelsEnabled?.(true);
      if (!modelPackActive(deps.modelAddress(), deps.modelBase ?? '/')) {
        deps.modelsEnabled?.(false);
        throw new LocalPackError('UNSUPPORTED_SURFACE', 'Model preview requires the test-room model-pack capability.');
      }
      check(signal);
      if (!runtime.installModelPack(pack, deps.modelAddress(), deps.modelBase ?? '/')) missing();
      try { await deps.reload(signal); check(signal); }
      catch (e) { if (runtime.clearModelPackIf(pack)) deps.modelsEnabled?.(false); throw e; }
    },
    async applyTexture(pack, signal) {
      check(signal);
      const target = deps.texturePacks() ?? missing();
      await target.activateStored(pack.entry.id, () => !signal.aborted && allowed(), signal);
      check(signal);
    },
    async loadedTextures() {
      check();
      const context = await deps.textureContext();
      check();
      return context;
    },
    async deactivate(kind, id, signal) {
      check(signal);
      if (kind === 'mod') {
        const panel = deps.modPanel() ?? missing();
        await panel.deactivateStored(id.replace(/^mod:/, ''), () => !signal.aborted && allowed());
        check(signal); await deps.reload(signal); check(signal);
      } else if (kind === 'model') {
        if (id !== 'model:current' || !modelPackSlotInstalled('primary')) return;
        const runtime = await import('../../modelPackRuntime');
        check(signal); deps.modelsEnabled?.(false); runtime.clearModelPackSlot('primary');
        await deps.reload(signal); check(signal);
      } else if (kind === 'texture') {
        const target = deps.texturePacks() ?? missing();
        const match = /^texture:([^:]+):([^:]+)$/.exec(id);
        if (!match || !target.isApplied(match[1]!, match[2]!)) return;
        target.deactivateStored(() => !signal.aborted && allowed());
      } else missing();
    },
  };
}
