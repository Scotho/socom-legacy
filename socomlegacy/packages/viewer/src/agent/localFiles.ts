/** Browser adaptation: bounded reads from a user-granted capability. No host paths, fetches or script execution. */
import { bytesSource, openZip, ZIP_LIMITS, type ZipArchive } from '../zipReader';

export const LOCAL_FILE_LIMITS = { files: 8192, bytes: 512 * 1024 * 1024, depth: 16, path: 240 } as const;
export type LocalPackErrorCode = 'REVISION_CONFLICT' | 'PERMISSION_REQUIRED' | 'INVALID_PATH' | 'NOT_FOUND' | 'LIMIT_EXCEEDED' |
  'DUPLICATE_PATH' | 'UNSUPPORTED_FORMAT' | 'INVALID_PACKAGE' | 'UNSUPPORTED_SURFACE' | 'STORAGE_FAILED' |
  'APPLY_FAILED' | 'ABORTED' | 'DISPOSED' | 'BUSY';

export class LocalFileError extends Error {
  constructor(readonly code: LocalPackErrorCode, message: string) { super(message); this.name = 'LocalFileError'; }
}
export interface LocalFile { readonly name: string; readonly size: number; readonly webkitRelativePath?: string; arrayBuffer(): Promise<ArrayBuffer> }
export interface LocalFileHandle { readonly kind: 'file'; readonly name: string; getFile(): Promise<LocalFile> }
export interface LocalDirectoryHandle {
  readonly kind: 'directory'; readonly name: string;
  queryPermission?(options: { mode: 'read' }): Promise<PermissionState>;
  getFileHandle(name: string): Promise<LocalFileHandle>;
  getDirectoryHandle(name: string): Promise<LocalDirectoryHandle>;
  values(): AsyncIterable<LocalDirectoryHandle | LocalFileHandle>;
}
export interface LocalEntry { path: string; bytes: Uint8Array }
export interface LocalReadOptions { signal?: AbortSignal; check?(): void; onRead?(files: number, bytes: number): void }
function fail(code: LocalPackErrorCode, message: string): never { throw new LocalFileError(code, message); }

/** Strict relative paths: no normalization can turn an unsafe spelling into an accepted path. */
export function localPath(path: string): string {
  if (typeof path !== 'string' || !path || path.length > LOCAL_FILE_LIMITS.path || /[\\:%\u0000-\u001f\u007f]/.test(path)) fail('INVALID_PATH', 'Use a relative path inside the granted folder.');
  const parts = path.split('/');
  if (parts.length > LOCAL_FILE_LIMITS.depth || parts.some(part => !part || part === '.' || part === '..' || part.startsWith('.') || /[. ]$/.test(part) || /[<>"|?*]/.test(part) || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))) {
    fail('INVALID_PATH', 'The relative path contains a reserved or unsafe segment.');
  }
  return path;
}

// FCW-33: md (Thunderstore's README.md / CHANGELOG.md), and the v2 roles' payload types gltf, ktx2, ogg and wav
// (`creator-contracts` packs.ts ROLE_TYPES). Every member is read as bytes; none is run.
const DATA_EXTENSION = /\.(json|zip|glb|gltf|png|ktx2|ogg|wav|md|txt|bin|dat|cfg|zar|zdb|zed|bnk|vag|adp|zam|zan|zmo|zmd)$/i;
function extension(path: string): void {
  if (!DATA_EXTENSION.test(path)) fail('UNSUPPORTED_FORMAT', 'Only supported pack data files may be imported.');
}
/**
 * FCW-33 fold F5: the wide set above serves the v2 `pack` kind. The legacy map/mod/model/texture imports keep the set
 * they had, so a stray .ogg/.md/.gltf/.ktx2/.wav member is refused there, never stored with a mod.
 */
const LEGACY_DATA_EXTENSION = /\.(json|zip|glb|png|txt|bin|dat|cfg|zar|zdb|zed|bnk|vag|adp|zam|zan|zmo|zmd)$/i;
export function legacyExtensions(entries: readonly { path: string }[]): void {
  for (const entry of entries) {
    if (!LEGACY_DATA_EXTENSION.test(entry.path)) fail('UNSUPPORTED_FORMAT', 'Only supported pack data files may be imported.');
  }
}
export function checkLocalRead(options: LocalReadOptions = {}): void {
  if (options.signal?.aborted) fail('ABORTED', 'The local operation was cancelled.');
  options.check?.();
}
/** Cancels the wait as well as refusing late results. The browser may finish an in-flight disk read privately. */
export async function localWait<T>(promise: Promise<T>, options: LocalReadOptions = {}): Promise<T> {
  checkLocalRead(options);
  const signal = options.signal;
  let abort: (() => void) | undefined;
  try {
    const value = signal ? await Promise.race([promise, new Promise<never>((_resolve, reject) => {
      abort = () => reject(new LocalFileError('ABORTED', 'The local operation was cancelled.'));
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    })]) : await promise;
    checkLocalRead(options);
    return value;
  } finally { if (abort) signal?.removeEventListener('abort', abort); }
}

function preflight(files: readonly { path: string; size: number }[]): void {
  if (files.length === 0 || files.length > LOCAL_FILE_LIMITS.files) fail('LIMIT_EXCEEDED', 'The pack file count is outside the local import limit.');
  let total = 0; const names = new Set<string>();
  for (const file of files) {
    localPath(file.path); extension(file.path);
    const key = file.path.toLowerCase();
    if (names.has(key)) fail('DUPLICATE_PATH', 'The pack contains duplicate file paths.');
    names.add(key);
    if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > LOCAL_FILE_LIMITS.bytes || (total += file.size) > LOCAL_FILE_LIMITS.bytes) fail('LIMIT_EXCEEDED', 'The pack exceeds the local byte limit.');
  }
}

export async function readPickedFiles(files: readonly LocalFile[], options: LocalReadOptions = {}): Promise<LocalEntry[]> {
  checkLocalRead(options);
  const named = files.map(file => ({ path: file.webkitRelativePath || file.name, size: file.size, file }));
  preflight(named);
  const entries: LocalEntry[] = []; let bytes = 0;
  for (const source of named) {
    checkLocalRead(options);
    const data = new Uint8Array(await localWait(source.file.arrayBuffer(), options));
    if (data.byteLength !== source.size) fail('INVALID_PACKAGE', 'A local file changed while it was being read.');
    bytes += data.length; entries.push({ path: source.path, bytes: data });
    options.onRead?.(entries.length, bytes);
    checkLocalRead(options);
  }
  return entries;
}

async function granted(root: LocalDirectoryHandle, options: LocalReadOptions): Promise<void> {
  if (!root.queryPermission || await localWait(root.queryPermission({ mode: 'read' }), options) !== 'granted') fail('PERMISSION_REQUIRED', 'Grant read access to a local folder in Connect first.');
}
function matched(node: LocalDirectoryHandle | LocalFileHandle, name: string): void {
  if (node.name !== name || (node.kind !== 'directory' && node.kind !== 'file')) fail('INVALID_PATH', 'The folder returned an unsupported file handle.');
}

export async function readLocalPath(root: LocalDirectoryHandle | null, path: string, options: LocalReadOptions = {}): Promise<LocalEntry[]> {
  localPath(path); checkLocalRead(options);
  if (!root) fail('PERMISSION_REQUIRED', 'Grant read access to a local folder in Connect first.');
  await granted(root, options);
  const parts = path.split('/'); let dir = root;
  try {
    for (const part of parts.slice(0, -1)) {
      dir = await localWait(dir.getDirectoryHandle(part), options); matched(dir, part);
    }
    const leaf = parts[parts.length - 1]!;
    let node: LocalDirectoryHandle | LocalFileHandle;
    try { node = await localWait(dir.getFileHandle(leaf), options); }
    catch (e) {
      if (!(e instanceof Error) || e.name !== 'TypeMismatchError') throw e;
      node = await localWait(dir.getDirectoryHandle(leaf), options);
    }
    matched(node, leaf);
    const files: LocalFile[] = []; let total = 0;
    const visit = async (item: LocalDirectoryHandle | LocalFileHandle, prefix: string, depth: number): Promise<void> => {
      checkLocalRead(options);
      if (depth > LOCAL_FILE_LIMITS.depth) fail('LIMIT_EXCEEDED', 'The folder is nested too deeply.');
      if (item.kind === 'file') {
        extension(prefix);
        const file = await localWait(item.getFile(), options);
        if (files.length >= LOCAL_FILE_LIMITS.files) fail('LIMIT_EXCEEDED', 'The folder contains too many files.');
        if (!Number.isSafeInteger(file.size) || file.size < 0 || (total += file.size) > LOCAL_FILE_LIMITS.bytes) fail('LIMIT_EXCEEDED', 'The folder exceeds the local byte limit.');
        files.push({ name: file.name, size: file.size, webkitRelativePath: prefix, arrayBuffer: () => file.arrayBuffer() });
      } else {
        for await (const child of item.values()) {
          localPath(child.name); matched(child, child.name);
          await visit(child, prefix ? `${prefix}/${child.name}` : child.name, depth + 1);
        }
      }
    };
    await visit(node, node.kind === 'file' ? leaf : '', 0);
    await granted(root, options);
    return await readPickedFiles(files, { ...options, check: () => { checkLocalRead(options); } });
  } catch (e) {
    if (e instanceof LocalFileError) throw e;
    if (e instanceof Error && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) fail('PERMISSION_REQUIRED', 'Local folder access was revoked.');
    fail('NOT_FOUND', 'The selected file or folder could not be read inside the granted root.');
  }
}

/** Refuse archive links/special files as well as paths. No extracted entry is ever interpreted as a link. */
function refuseZipLinks(bytes: Uint8Array): void {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let end = bytes.length - 22; end >= Math.max(0, bytes.length - 65557); end--) {
    if (view.getUint32(end, true) !== 0x06054b50 || end + 22 + view.getUint16(end + 20, true) !== bytes.length) continue;
    let at = view.getUint32(end + 16, true); const count = view.getUint16(end + 10, true);
    for (let i = 0; i < count && at + 46 <= end; i++) {
      const mode = view.getUint32(at + 38, true) >>> 16; const type = mode & 0xf000;
      if (type !== 0 && type !== 0x8000 && type !== 0x4000) fail('INVALID_PATH', 'Archive links and special files are not supported.');
      at += 46 + view.getUint16(at + 28, true) + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
    }
    return;
  }
  fail('INVALID_PACKAGE', 'Trailing archive data is not supported.');
}

/** Check every declared path, type and expanded size before any member is inflated. */
export async function inspectLocalZip(bytes: Uint8Array, options: LocalReadOptions = {}): Promise<ZipArchive> {
  checkLocalRead(options);
  try {
    const zip = await localWait(openZip(bytesSource(bytes), { ...ZIP_LIMITS, archiveBytes: LOCAL_FILE_LIMITS.bytes, members: LOCAL_FILE_LIMITS.files, memberBytes: LOCAL_FILE_LIMITS.bytes }), options);
    refuseZipLinks(bytes);
    const names = new Set<string>();
    for (const member of zip.members) {
      const path = localPath(member.name.endsWith('/') ? member.name.slice(0, -1) : member.name).toLowerCase();
      if (names.has(path)) fail('DUPLICATE_PATH', 'The archive contains duplicate file or directory paths.');
      names.add(path);
    }
    const members = zip.members.filter(member => !member.name.endsWith('/'));
    preflight(members.map(member => ({ path: member.name, size: member.size })));
    return zip;
  } catch (e) {
    if (e instanceof LocalFileError) throw e;
    fail('INVALID_PACKAGE', 'The selected archive is not a supported, bounded ZIP package.');
  }
}

export async function unpackLocalZip(bytes: Uint8Array, options: LocalReadOptions = {}): Promise<LocalEntry[]> {
  try {
    const zip = await inspectLocalZip(bytes, options);
    const members = zip.members.filter(member => !member.name.endsWith('/'));
    const entries: LocalEntry[] = []; let total = 0;
    for (const member of members) {
      const data = await localWait(zip.read(member), options);
      total += data.length; entries.push({ path: member.name, bytes: data }); options.onRead?.(entries.length, total);
    }
    checkLocalRead(options); return entries;
  } catch (e) {
    if (e instanceof LocalFileError) throw e;
    fail('INVALID_PACKAGE', 'The selected archive is not a supported, bounded ZIP package.');
  }
}
