import type { Scene } from 'three';
import type { ViewerRenderer } from './renderer';

/**
 * The `visual.post` seam (FCW-07b), a browser adaptation with no original (`VISUAL_POST_SEAM_ADAPTATION`): one
 * full-screen pass drawn over the world's finished picture at the end of `ViewerRenderer.render` (`./renderer`), on
 * the target the frame ended on, before the caller's HUD passes. It is the narrowest frame-level point the renderer
 * has: the pass is a scene of its own, drawn with the renderer's clip-space camera, so it touches no object of the
 * world's scene graph, no material the original draws, and no target or pipeline of the frame before it. With no pass
 * installed the frame's draw list is the original's, unchanged.
 *
 * Claimed in ONE place (`createRenderer`, through `bindVisualPostSeam`), and reachable only through this module: the
 * renderer keeps no property for it (FCW-07b-2, B2-4). `visualPostSeams(renderer)` hands it, once per renderer, to the
 * one claimant -- the application's composition, `createExtensionHost({ seams: visualPostSeams(renderer), handlers })`
 * -- so a pass is installed and uninstalled only through the extension host (`./packs/systems/host`), which hands a
 * system a lease on this seam, never the seam itself.
 */
export const VISUAL_POST_SEAM_ADAPTATION =
  'one full-screen pass over the finished picture, drawn only while an engine-owned system holds it; with none installed the frame is the original draw list' as const;

/** One post pass: its owner's name for it and the scene drawn (a clip-space full-screen draw, its materials its own). */
export interface VisualPostPass {
  readonly id: string;
  readonly scene: Scene;
}

export interface VisualPostSeam {
  /** Install `pass`; one at a time (a second install throws). The function returned uninstalls it, restoring the exact prior state; a second call does nothing. */
  install(pass: VisualPostPass): () => void;
  /** The renderer's draw configuration and the installed pass's id, as plain data: equal before an install and after its uninstall. */
  snapshot(): Readonly<Record<string, unknown>>;
}

export interface PostSlot {
  readonly seam: VisualPostSeam;
  /** The pass the renderer draws this frame, or none. */
  current(): VisualPostPass | null;
}

/** The slot behind the seam; `configuration` reads the renderer's draw configuration for `snapshot`. */
export function createPostSlot(configuration: () => Readonly<Record<string, unknown>>): PostSlot {
  let held: VisualPostPass | null = null;
  const seam: VisualPostSeam = {
    install(pass) {
      if (held) throw new Error(`The visual post seam already holds ${held.id}.`);
      held = pass;
      let done = false;
      return () => {
        if (done) return;
        done = true;
        if (held === pass) held = null;
      };
    },
    snapshot: () => ({ ...configuration(), post: held ? held.id : null }),
  };
  return { seam, current: () => held };
}

/** Each renderer's seam, held here and not on the renderer: no caller reaches it but through `visualPostSeams`. */
const bound = new WeakMap<object, { readonly seam: VisualPostSeam; claimed: boolean }>();

/** `createRenderer`'s one call: the slot's seam bound to the renderer it returns. A second binding is a programming error. */
export function bindVisualPostSeam(renderer: ViewerRenderer, slot: PostSlot): void {
  if (bound.has(renderer)) throw new Error('This renderer already has a visual post seam.');
  bound.set(renderer, { seam: slot.seam, claimed: false });
}

/** What `createExtensionHost` takes as its `seams`: the renderer's slots by id. */
export type VisualPostSeams = Readonly<{ 'visual.post': VisualPostSeam }>;

/**
 * The renderer's seams for the extension host, handed once: a second call for the same renderer throws, so after the
 * composition's host has them no other caller can install a pass. The install path is closed over here, never a
 * property of the renderer.
 */
export function visualPostSeams(renderer: ViewerRenderer): VisualPostSeams {
  const held = bound.get(renderer);
  if (!held) throw new Error('This renderer claimed no visual post seam.');
  if (held.claimed) throw new Error('The visual post seam is already claimed by an extension host.');
  held.claimed = true;
  return Object.freeze({ 'visual.post': held.seam });
}
