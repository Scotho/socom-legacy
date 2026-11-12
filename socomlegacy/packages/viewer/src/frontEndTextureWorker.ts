import { answerUiTextureDecode, type UiTextureDecodeReply, type UiTextureDecodeRequest } from './frontEndTextureBank';

/**
 * GM-29 (plan `docs/plans/2026-11-01-gpu-menus.md`, row GM-29): the front end's texture decode worker's entry -- the page
 * starts it with `new Worker(new URL('./frontEndTextureWorker.ts', import.meta.url), { type: 'module' })`
 * (`./frontEndAssets` `pageUiTextureDecoder`). It holds only the channel's wiring (review fold 3): the decode is
 * `./frontEndTextureBank`'s, side-effect free, which the page imports; nothing imports this file. PRODUCT TRACK, a
 * browser adaptation. Each request is answered in its turn; an answer that will not post still answers its id.
 */
interface ServePort {
  onmessage: ((e: { data: UiTextureDecodeRequest }) => void) | null;
  postMessage(m: UiTextureDecodeReply, transfer: Transferable[]): void;
}
function serve(port: ServePort): void {
  port.onmessage = (e) => {
    const { reply, transfer } = answerUiTextureDecode(e.data);
    try { port.postMessage(reply, transfer); } catch (x) {
      try { port.postMessage({ id: reply.id, ok: false, error: `frontEndTextureWorker: the answer would not post (${x instanceof Error ? x.message : String(x)})` }, []); } catch { /* the channel is gone */ }
    }
  };
}

// Served only when this module runs as the worker.
const scope = globalThis as unknown as { WorkerGlobalScope?: abstract new () => unknown };
if (typeof scope.WorkerGlobalScope === 'function' && globalThis instanceof scope.WorkerGlobalScope) serve(globalThis as unknown as ServePort);
