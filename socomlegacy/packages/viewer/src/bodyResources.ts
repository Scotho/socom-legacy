import type { BufferGeometry, Texture } from 'three';

/** Browser memory adaptation: a live borrower owns a reference, never a permanent cache entry. */
export interface RenderResourceLease<T> { readonly value: T; release(): void }

class RenderResourcePool<T extends { dispose(): void }> {
  private readonly sources = new Map<object, Map<string, { value: T; borrowers: number }>>();

  acquire(source: object, variant: string, create: () => T): RenderResourceLease<T> {
    let variants = this.sources.get(source);
    let entry = variants?.get(variant);
    if (!entry) {
      // A failed constructor publishes no entry and retains no decoded source.
      const value = create();
      if (!variants) this.sources.set(source, variants = new Map());
      entry = { value, borrowers: 0 };
      variants.set(variant, entry);
    }
    entry.borrowers++;
    const held = entry, ownedVariants = variants!;
    let released = false;
    return {
      value: held.value,
      release: () => {
        if (released) return;
        released = true;
        if (--held.borrowers !== 0) return;
        ownedVariants.delete(variant);
        if (ownedVariants.size === 0) this.sources.delete(source);
        held.value.dispose();
      },
    };
  }
}

class BodyResources {
  readonly geometry = new RenderResourcePool<BufferGeometry>();
  readonly texture = new RenderResourcePool<Texture>();
}

// Ownership follows the decoded map, not a process-wide model name. Zero-borrower entries are removed immediately;
// the WeakMap also cannot keep an abandoned map alive. Poses, skeletons, materials and lighting remain per body.
const maps = new WeakMap<object, BodyResources>();
export function bodyResourcesFor(map: object): BodyResources {
  let resources = maps.get(map);
  if (!resources) maps.set(map, resources = new BodyResources());
  return resources;
}
