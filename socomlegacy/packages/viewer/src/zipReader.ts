import {crc32,inflateBounded} from './png';

/**
 * GX-27 (plan 2026-10-10-web-graphics-slice-4-packs; product track): a zip reader for the test room's texture pack
 * upload -- a browser adaptation with no original (H135); it reads an artist's zip, never the disc. No dependency, no
 * `node:` import. APPNOTE's plain form only: the end record (past a comment of up to 64 KiB), the central directory, and
 * each member's bytes stored (method 0) or deflated (method 8, `DecompressionStream('deflate-raw')`), its size and CRC-32
 * checked. Refused, each with its reason: zip64, a multi-part archive, encryption, any other method, a name that would
 * leave the archive when extracted (`..`, absolute, a drive, a backslash), a name given twice, and anything past the
 * bounds below. The archive is read by ranges (`ZipSource`), so a large upload is never held whole.
 */
export const ZIP_LIMITS = {
  /** The archive's size: what a zip without zip64 can address, halved (a browser adaptation's bound, not a console value). */
  archiveBytes: 2 * 1024 * 1024 * 1024,
  /** Members: an all-maps base package holds about 1500 (22 maps x 2 files a texture). */
  members: 8192,
  centralDirectoryBytes: 4 * 1024 * 1024,
  /** One member, inflated: a PNG of the largest image the import reads (6144 x 6144 RGBA, `3 x 512 x 4` an edge) stored uncompressed. */
  memberBytes: 160 * 1024 * 1024,
} as const;
export type ZipLimits = {[K in keyof typeof ZIP_LIMITS]: number};
/** A refusal of the archive, with its reason. */
export class ZipError extends Error {constructor(reason: string) {super(reason); this.name = 'ZipError';}}
/** The archive by ranges: its size and a read of `length` bytes at `offset`. */
export interface ZipSource {size: number; read(offset: number, length: number): Promise<Uint8Array>}
export const bytesSource = (bytes: Uint8Array): ZipSource => ({size: bytes.length, read: async (offset, length) => bytes.subarray(offset, offset + length)});
/** A `File` or `Blob` (the file chooser's), read a range at a time. */
export const blobSource = (blob: Blob): ZipSource => ({
  size: blob.size,
  read: async (offset, length) => new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer()),
});
export interface ZipMember {name: string; method: 0 | 8; crc32: number; compressedSize: number; size: number; offset: number}
export interface ZipArchive {members: readonly ZipMember[]; read(member: ZipMember): Promise<Uint8Array>; head(member: ZipMember, n: number): Promise<Uint8Array>}

const END = 0x06054b50, CENTRAL = 0x02014b50, LOCAL = 0x04034b50, ZIP64_LOCATOR = 0x07064b50;
const refuse = (reason: string): never => { throw new ZipError(reason); };
/** A member name that stays inside the archive when extracted. */
export const safeMemberName = (name: string): boolean =>
  name !== '' && !name.startsWith('/') && !name.includes('\\') && !/^[A-Za-z]:/.test(name) && !name.split('/').includes('..');
const decodeName = (bytes: Uint8Array, utf8: boolean): string => utf8 ? new TextDecoder('utf-8', {fatal: false}).decode(bytes) : String.fromCharCode(...bytes);

export async function openZip(source: ZipSource, limits: ZipLimits = ZIP_LIMITS): Promise<ZipArchive> {
  if (source.size > limits.archiveBytes) refuse(`the zip is over ${limits.archiveBytes} bytes`);
  if (source.size < 22) refuse('not a zip (no end of central directory)');
  const tailLength = Math.min(source.size, 22 + 0xffff), tailStart = source.size - tailLength;
  const tail = await source.read(tailStart, tailLength), tv = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let end = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (tv.getUint32(i, true) === END && i + 22 + tv.getUint16(i + 20, true) <= tail.length) { end = i; break; }
  if (end < 0) refuse('not a zip (no end of central directory)');
  const disk = tv.getUint16(end + 4, true), cdDisk = tv.getUint16(end + 6, true), here = tv.getUint16(end + 8, true), count = tv.getUint16(end + 10, true);
  const cdSize = tv.getUint32(end + 12, true), cdOffset = tv.getUint32(end + 16, true);
  if ((end >= 20 && tv.getUint32(end - 20, true) === ZIP64_LOCATOR) || count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) refuse('zip64 is not supported');
  if (disk !== 0 || cdDisk !== 0 || here !== count) refuse('multi-part zips are not supported');
  if (count > limits.members) refuse(`more than ${limits.members} members`);
  const endOffset = tailStart + end;
  if (cdSize > limits.centralDirectoryBytes) refuse(`the central directory is over ${limits.centralDirectoryBytes} bytes`);
  if (cdOffset + cdSize > endOffset) refuse('the central directory is malformed');
  const cd = await source.read(cdOffset, cdSize), cv = new DataView(cd.buffer, cd.byteOffset, cd.byteLength);
  const members: ZipMember[] = [], names = new Set<string>();
  let at = 0;
  for (let n = 0; n < count; n++) {
    if (at + 46 > cd.length || cv.getUint32(at, true) !== CENTRAL) refuse('the central directory is malformed');
    const flags = cv.getUint16(at + 8, true), method = cv.getUint16(at + 10, true), crc = cv.getUint32(at + 16, true);
    const compressedSize = cv.getUint32(at + 20, true), size = cv.getUint32(at + 24, true);
    const nameLength = cv.getUint16(at + 28, true), extraLength = cv.getUint16(at + 30, true), commentLength = cv.getUint16(at + 32, true);
    const offset = cv.getUint32(at + 42, true);
    if (at + 46 + nameLength + extraLength + commentLength > cd.length) refuse('the central directory is malformed');
    const name = decodeName(cd.subarray(at + 46, at + 46 + nameLength), (flags & 0x0800) !== 0);
    if (!safeMemberName(name)) refuse(`unsafe member name "${name.slice(0, 80)}"`);
    if (names.has(name)) refuse(`${name}: given twice`);
    names.add(name);
    if (compressedSize === 0xffffffff || size === 0xffffffff || offset === 0xffffffff) refuse('zip64 is not supported');
    if (flags & 0x41) refuse(`${name}: encrypted members are not supported`);
    if (method !== 0 && method !== 8) refuse(`${name}: compression method ${method} is not supported (stored or deflate only)`);
    if (offset + 30 > cdOffset) refuse(`${name}: local header is malformed`);
    members.push({name, method: method as 0 | 8, crc32: crc, compressedSize, size, offset});
    at += 46 + nameLength + extraLength + commentLength;
  }
  const read = async (m: ZipMember): Promise<Uint8Array> => {
    if (m.size > limits.memberBytes) refuse(`${m.name}: over ${limits.memberBytes} bytes`);
    // GX-27 review F1: what the directory declares is refused before any of the member is read.
    if (m.compressedSize > limits.memberBytes) refuse(`${m.name}: over ${limits.memberBytes} bytes compressed`);
    if (m.method === 0 && m.compressedSize !== m.size) refuse(`${m.name}: wrong size`);
    const head = await source.read(m.offset, 30), hv = new DataView(head.buffer, head.byteOffset, head.byteLength);
    if (head.length < 30 || hv.getUint32(0, true) !== LOCAL) refuse(`${m.name}: local header is malformed`);
    const start = m.offset + 30 + hv.getUint16(26, true) + hv.getUint16(28, true);
    if (start + m.compressedSize > cdOffset) refuse(`${m.name}: local header is malformed`);
    const body = await source.read(start, m.compressedSize);
    let data: Uint8Array;
    if (m.method === 0) data = body;
    else {
      const out = await inflateBounded(body, 'deflate-raw', m.size);
      if (out === 'bad') refuse(`${m.name}: data does not inflate`);
      if (out === 'over') refuse(`${m.name}: inflates past its declared size`);
      data = out as Uint8Array;
    }
    if (data.length !== m.size) refuse(`${m.name}: wrong size`);
    if (crc32(data) !== m.crc32) refuse(`${m.name}: CRC mismatch`);
    return data;
  };
  /** The member's first `n` bytes (fewer when it is shorter), inflating no further; unchecked by size or CRC. */
  const head = async (m: ZipMember, n: number): Promise<Uint8Array> => {
    const local = await source.read(m.offset, 30), lv = new DataView(local.buffer, local.byteOffset, local.byteLength);
    if (local.length < 30 || lv.getUint32(0, true) !== LOCAL) refuse(`${m.name}: local header is malformed`);
    const start = m.offset + 30 + lv.getUint16(26, true) + lv.getUint16(28, true);
    if (start + m.compressedSize > cdOffset) refuse(`${m.name}: local header is malformed`);
    if (m.method === 0) return source.read(start, Math.min(n, m.compressedSize));
    const out = await inflateBounded(await source.read(start, Math.min(m.compressedSize, 64 * 1024)), 'deflate-raw', Number.MAX_SAFE_INTEGER, {prefix: n});
    return out === 'bad' || out === 'over' ? new Uint8Array(0) : out.subarray(0, n);
  };
  return {members, read, head};
}
