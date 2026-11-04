import type { SoloTestroomTarget } from './target';

/** Browser adaptation: module-scoped handoff to the test-room connection UI; never a global viewer hook. */
let current: SoloTestroomTarget | null = null;
const listeners = new Set<(api: SoloTestroomTarget | null) => void>();
export function publishSoloAgentApi(api: SoloTestroomTarget | null): void {
  if (current === api) return;
  current = api;
  for (const listener of listeners) listener(api);
}
export function subscribeSoloAgentApi(listener: (api: SoloTestroomTarget | null) => void): () => void {
  listeners.add(listener);
  listener(current);
  return () => listeners.delete(listener);
}
