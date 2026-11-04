import { serveDiscCopy, type CopyPort } from './discCopyProtocol';

/**
 * **The disc copy's worker entry** (disc-access plan DA-8; research 306 §10): a module worker the page starts with `new
 * Worker(new URL('./discCopyWorker.ts', import.meta.url), { type: 'module' })` (`./discCopy`), as `./worker.ts` and
 * `./movieWorker.ts` are started, so a build bundles it. It serves this thread's scope and nothing else; everything it
 * runs is `./discCopyProtocol`'s, which has no side effect on import (DA-8's review, F4). Only this file is loaded as
 * the worker: no module imports it. A **browser adaptation** (DA.R2, DA.R3).
 */
serveDiscCopy(self as unknown as CopyPort);
