import { renderHost, type RenderHostMessage, type RenderHostReply } from './offThreadRender';

// OFF_THREAD_RENDER_ADAPTATION (`./offThreadRender`): the one-shots' renders, off the page's thread.
const scope = self as unknown as {
  postMessage(reply: RenderHostReply, transfer: ArrayBuffer[]): void;
  onmessage: ((event: { data: RenderHostMessage }) => void) | null;
};
const host = renderHost((reply, transfer) => scope.postMessage(reply, transfer));
scope.onmessage = event => host(event.data);
