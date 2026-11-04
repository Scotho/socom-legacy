import { serveDiscExtract, type ExtractPort } from './discExtractProtocol';
import { opfsExtractStore } from './discExtractStore';
import type { CopyDirectoryHandle } from './discCopy';
import { pageOriginStorage } from './pageStore';

/**
 * **The extraction's worker entry** (front-end plan DX-1, FI.R6): a module worker the page starts with `new Worker(new
 * URL('./discExtractWorker.ts', import.meta.url), { type: 'module' })` (`./discExtract`), as `./discCopyWorker.ts` is,
 * so a build bundles it. It resolves destination names in this thread's OPFS; handles never cross the page/worker
 * channel; the OPFS is reached through `./pageStore` `pageOriginStorage`, as the page's other storages are (its
 * `WorkerNavigator`'s here; `./pageStore` builds nothing that touches a storage on import). Its protocol and store have
 * no side effects on import. Only this file is loaded as the worker. A **browser adaptation** (FI.R2, DA.R3).
 */
const origin = async (): Promise<CopyDirectoryHandle> => {
  const storage = pageOriginStorage();
  if (!storage) throw new DOMException('this worker has no origin private file system', 'NotSupportedError');
  return await storage.getDirectory() as unknown as CopyDirectoryHandle;
};
serveDiscExtract(self as unknown as ExtractPort, (dir, path) => opfsExtractStore(origin, dir).target(path));
