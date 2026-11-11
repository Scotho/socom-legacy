import type { LocalPackApi } from '../agent/localPacks';
import { DROPZONE_BLOCKED_BUILD, mountFileDropzone } from '../agent/fileDropzone';

/** Browser adaptation: a host-mounted, abortable staging view over the existing pack API's byte/path admission. */
export interface AssetFileStagingOptions {
  packs: Pick<LocalPackApi, 'stage'>;
  allowed(): boolean;
  /** The blocked sentence for the case the owner is in (LATER 799); the Build sentence when absent. */
  blockedReason?(): string;
  refresh(): void;
  signal: AbortSignal;
}
export function mountAssetFileStaging(host: HTMLElement, options: AssetFileStagingOptions) {
  const doc = host.ownerDocument, reads = new Set<AbortController>();
  let disposed = false;
  const allowed = (): boolean => !disposed && !options.signal.aborted && doc.visibilityState !== 'hidden' && options.allowed();
  const blockedReason = (): string => options.blockedReason?.() ?? DROPZONE_BLOCKED_BUILD;
  const zone = mountFileDropzone(host, {
    allowed, blockedReason,
    stage: async files => {
      if (!allowed()) throw new Error(blockedReason());
      const read = new AbortController(); reads.add(read);
      try {
        await options.packs.stage(files, { signal: read.signal });
        // A fulfilled pack API call has already staged the bytes. A later abort suppresses view refresh, but cannot
        // truthfully turn that completed work into a cancelled read. In-flight cancellation still rejects stage().
        if (!read.signal.aborted && allowed()) options.refresh();
      } finally { reads.delete(read); }
    },
  });
  const abortReads = (): void => { for (const read of reads) read.abort(); };
  const refresh = (): void => { if (!allowed()) abortReads(); zone.refresh(); };
  const dispose = (): void => {
    if (disposed) return;
    disposed = true; abortReads(); reads.clear(); zone.dispose();
    doc.removeEventListener('visibilitychange', refresh); options.signal.removeEventListener('abort', dispose);
  };
  doc.addEventListener('visibilitychange', refresh); options.signal.addEventListener('abort', dispose, { once: true });
  if (options.signal.aborted) dispose(); else refresh();
  return { refresh, dispose };
}
