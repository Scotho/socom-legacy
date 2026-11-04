/** Product adaptation: validated native identity lives beside its unchanged legacy payload. */
import type { CheckReport, PackFile, PackManifest, PackRef } from '@s2u/creator-contracts';
import { PackStorageError, type PackDatabase, type PackMetadata, type PackWriteOptions } from './storage';
export interface NativePackIdentity { ref: PackRef; manifest: PackManifest; report: CheckReport }
export interface NativePackObservation {
  database: PackDatabase; generation: number; kind: PackMetadata['kind']; refPath: readonly (string | number)[];
  files: readonly PackFile[] | null; identity?: NativePackIdentity;
}
export interface NativeIdentityWriter {
  inspect(id: string, signal?: AbortSignal): Promise<NativePackObservation | null>;
  identify(id: string, identity: NativePackIdentity, options: PackWriteOptions): Promise<void>;
}
/** A bounded member (or spans of model chunks), without assembling a whole model file. */
export function storedMember(database: PackDatabase, scope: PackMetadata, name: string,
  spans: readonly { path: readonly (string | number)[]; offset?: number; bytes: number }[], signal?: AbortSignal): PackFile {
  return { path: name, size: spans.reduce((total, span) => total + span.bytes, 0), async *read() {
    for (const span of spans) {
      let offset = 0, emitted = 0;
      for await (const chunk of database.streamAt(scope.kind, span.path, { expectedGeneration: scope.generation, signal })) {
        const begin = Math.max(0, (span.offset ?? 0) - offset), end = Math.min(chunk.length, (span.offset ?? 0) + span.bytes - offset);
        if (end > begin) { emitted += end - begin; yield chunk.subarray(begin, end); }
        offset += chunk.length;
        if (offset >= (span.offset ?? 0) + span.bytes) break;
      }
      if (emitted !== span.bytes) throw new PackStorageError('FAILED', 'A stored native member is incomplete.');
    }
  } };
}
export function memberAt(database: PackDatabase, scope: PackMetadata, path: readonly (string | number)[], name: string,
  signal?: AbortSignal): PackFile {
  const binary = scope.binary.find(member => member.path.length === path.length && path.every((key, index) => key === member.path[index]));
  if (!binary) throw new PackStorageError('FAILED', 'A stored native member is missing.');
  return storedMember(database, scope, name, [{ path, bytes: binary.byteLength }], signal);
}
