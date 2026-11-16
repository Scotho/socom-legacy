import type { MatchWorker } from './matchMount';
import type { ViewerRequest, ViewerResponse } from './worker';

/**
 * Browser adaptation: on Xbox, only one decoder runs at a time. Each request gets a fresh isolate, terminated before
 * its terminal answer reaches the page. This releases archive/decode garbage before the next asset class starts;
 * terminating only after all four requests leaves their temporary allocations alive together. Assets are unchanged.
 */
export function serialMatchWorker(make: () => MatchWorker): MatchWorker {
  const queued: ViewerRequest[] = [];
  const listeners = new Set<(e: MessageEvent<ViewerResponse>) => void>();
  let current: MatchWorker | null = null;
  let stopped = false;
  let scheduled = false;
  const next = (): void => {
    if (stopped || current || scheduled || queued.length === 0) return;
    const request = queued.shift()!;
    let own: MatchWorker | null = null;
    const reply = (data: ViewerResponse): void => {
      if (stopped || current !== own) return;
      const terminal = data.kind !== 'progress' && data.kind !== 'loading' && data.kind !== 'sound';
      if (terminal) {
        own?.terminate(); current = null;
        // Do not start another decoder from a reply listener until all listeners have seen this answer.
        scheduled = true;
      }
      for (const listener of listeners) listener({ data } as MessageEvent<ViewerResponse>);
      if (terminal) queueMicrotask(() => { scheduled = false; next(); });
    };
    const failed = (error: unknown): void => reply({ kind: 'error', id: 'id' in request ? request.id : 0,
      doing: `decoding ${request.kind}`, message: error instanceof Error ? error.message : String(error) });
    try {
      own = make(); current = own;
      own.addEventListener('message', (e) => reply(e.data));
      own.addEventListener('error', () => failed(new Error('The map asset decoder stopped before completing its request.')));
      own.postMessage(request);
    } catch (error) { failed(error); }
  };
  return {
    postMessage: (request) => { if (!stopped) { queued.push(request); next(); } },
    addEventListener: ((type: string, listener: (e: MessageEvent<ViewerResponse>) => void) => {
      // Native crashes are converted to the active request's error reply, so queued requests still settle normally.
      if (type === 'message') listeners.add(listener);
    }) as MatchWorker['addEventListener'],
    terminate: () => { stopped = true; queued.length = 0; current?.terminate(); current = null; listeners.clear(); },
  };
}
