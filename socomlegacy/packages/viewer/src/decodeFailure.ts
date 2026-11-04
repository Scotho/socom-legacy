/**
 * A decode that failed, told on the page (`main.ts`): the loading overlay comes down and the reason goes where the
 * visitor is looking -- the disc page's own line while it is up (the panel is not unfolded over it), else the status
 * line as an error. Used for the worker's own `{ kind: 'error' }` replies and for a worker that fails without one: a
 * module that will not load, an exception outside its request's `try`, a reply the page cannot deserialise
 * (`messageerror`). Without those two listeners the disc page stayed on "reading the disc image ..." for good.
 * No game behaviour: the page's robustness rule (a thrown error reaches the page as a message, not a hang).
 */

/** The page's surface this needs (`./ui`'s `Ui`). */
export interface DecodeFailureUi {
  setLoading(on: boolean): void;
  discPageShown(): boolean;
  setDiscState(text: string, kind?: 'ok' | 'error'): void;
  setStatus(text: string, kind?: 'ok' | 'error'): void;
  /** Shows the disc page (`Ui.offerDisc`). */
  offerDisc?(): void;
}

/**
 * `offer`: nothing is open to fall back on (no source, nothing served) -- the disc page is offered first, so the
 * failure is said on its line and the visitor can drop the disc again (review 2, m-15: a disc dropped while the page
 * came up left a bare canvas when its index failed).
 */
export function reportDecodeFailure(ui: DecodeFailureUi, text: string, offer = false): void {
  ui.setLoading(false);
  if (offer && !ui.discPageShown()) ui.offerDisc?.();
  if (ui.discPageShown()) { ui.setDiscState(text, 'error'); ui.setStatus(text); } else ui.setStatus(text, 'error');
}

/** The line for a worker's `error` event. */
export const workerStoppedText = (message: string | undefined): string => `the decoder stopped: ${message || 'unknown error'}`;
/** The line for a worker's `messageerror` event. */
export const MESSAGE_ERROR_TEXT = 'the decoder sent a message the page could not read';

/**
 * Listens on the decode worker for the failures that post no reply; `failed` runs first (the page forgets what it was
 * waiting for) and answers whether nothing is left open, so the disc page is offered (`reportDecodeFailure`'s
 * `offer`). Returns the unsubscribe.
 */
export function wireWorkerFailure(worker: EventTarget, ui: DecodeFailureUi, failed: () => boolean | void = () => {}): () => void {
  const onError = (e: Event): void => {
    const offer = failed() === true;
    reportDecodeFailure(ui, workerStoppedText((e as ErrorEvent).message), offer);
  };
  const onMessageError = (): void => {
    const offer = failed() === true;
    reportDecodeFailure(ui, MESSAGE_ERROR_TEXT, offer);
  };
  worker.addEventListener('error', onError);
  worker.addEventListener('messageerror', onMessageError);
  return () => {
    worker.removeEventListener('error', onError);
    worker.removeEventListener('messageerror', onMessageError);
  };
}
