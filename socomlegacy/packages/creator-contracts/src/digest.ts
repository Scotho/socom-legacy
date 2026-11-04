/**
 * Canonical pack digests, a browser adaptation (product track, `docs/specs/2026-10-25-pack-framework.md`): no original.
 * One path in Node and the browser: SHA-256 through WebCrypto `subtle` where it exists, else an injected function
 * (a Node host passes `node:crypto`; this module imports no Node API). The incremental `createSha256` has no WebCrypto
 * form, so it is an injected stream, `node:crypto`'s where the host has it, or the pure-JS `sha256Pure`. Paths are
 * NFC, ordered by their UTF-8 bytes (never `localeCompare`, never UTF-16 units), and serialised by `canonicalJson`.
 */

/** A SHA-256 over bytes: WebCrypto's in the browser and Node 20+, or an injected one. */
export type Sha256 = (bytes: Uint8Array) => Promise<Uint8Array>;

export type DigestErrorCode = "NO_DIGEST" | "NOT_CANONICAL" | "PATH_COLLISION" | "HASH_INVALID" | "STREAM_DONE";
export class DigestError extends Error {
  readonly code: DigestErrorCode;
  constructor(code: DigestErrorCode, message: string) {
    super(message);
    this.name = "DigestError";
    this.code = code;
  }
}

let fallback: Sha256 | null = null;
/** The tiny injectable: a host without WebCrypto `subtle` sets its SHA-256 once (null clears it). */
export function setSha256Fallback(hash: Sha256 | null): void {
  fallback = hash;
}

function webCrypto(): Sha256 | null {
  const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle;
  if (!subtle) return null;
  // Copy the VIEW into its own ArrayBuffer: a Node Buffer's `slice()` is a view over the shared pool, so
  // `.buffer` would hand SubtleCrypto the whole pool (unrelated bytes before and after the view).
  return async (bytes) => new Uint8Array(await subtle.digest("SHA-256", new Uint8Array(bytes).buffer as ArrayBuffer));
}

/** Lower-case hex SHA-256: the explicit function, else WebCrypto, else the fallback. */
export async function sha256Hex(bytes: Uint8Array, hash?: Sha256): Promise<string> {
  const fn = hash ?? webCrypto() ?? fallback;
  if (!fn) throw new DigestError("NO_DIGEST", "No SHA-256 is available: WebCrypto is absent and no fallback is set.");
  const out = await fn(bytes);
  return Array.from(out, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * An incremental SHA-256, so a member is hashed chunk by chunk (a store cursor over a 500 MiB member) and never
 * reassembled. `digestHex` is called once; an update or a digest after it is refused (`STREAM_DONE`).
 */
export interface Sha256Stream {
  update(chunk: Uint8Array): void;
  digestHex(): Promise<string>;
}
export type Sha256StreamFactory = () => Sha256Stream;

let streamFallback: Sha256StreamFactory | null = null;
/** The stream's injectable: a host sets its incremental SHA-256 once (a Node host may pass `node:crypto`'s); null clears it. */
export function setSha256StreamFallback(factory: Sha256StreamFactory | null): void {
  streamFallback = factory;
}

/** `node:crypto`'s `createHash` where the host has it synchronously (`process.getBuiltinModule`); no import, so a browser bundle holds none. */
function nodeStream(): Sha256StreamFactory | null {
  type Hash = { update(chunk: Uint8Array): unknown; digest(encoding: "hex"): string };
  const get = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process?.getBuiltinModule;
  if (typeof get !== "function") return null;
  let crypto: { createHash?: (algorithm: string) => Hash } | undefined;
  try {
    crypto = get("node:crypto") as typeof crypto;
  } catch {
    return null;
  }
  const createHash = crypto?.createHash;
  if (typeof createHash !== "function") return null;
  return () => {
    const h = createHash("sha256");
    return { update: (chunk) => void h.update(chunk), digestHex: async () => h.digest("hex") };
  };
}

/** FIPS 180-4 4.2.2: the first 32 bits of the fractional parts of the cube roots of the first 64 primes. */
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
/** FIPS 180-4 5.3.3: the initial hash value, the square roots of the first 8 primes. */
const H0 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));

/** FIPS 180-4 6.2.2: one 64-byte block of `p` at `o` into the state `h`, the schedule in `w`. */
function compress(h: Uint32Array, w: Uint32Array, p: Uint8Array, o: number): void {
  for (let i = 0; i < 16; i++, o += 4) w[i] = (p[o]! << 24) | (p[o + 1]! << 16) | (p[o + 2]! << 8) | p[o + 3]!;
  for (let i = 16; i < 64; i++) {
    const x = w[i - 15]!;
    const y = w[i - 2]!;
    w[i] = w[i - 16]! + (rotr(x, 7) ^ rotr(x, 18) ^ (x >>> 3)) + w[i - 7]! + (rotr(y, 17) ^ rotr(y, 19) ^ (y >>> 10));
  }
  let [a, b, c, d, e, f, g, k] = [h[0]!, h[1]!, h[2]!, h[3]!, h[4]!, h[5]!, h[6]!, h[7]!];
  for (let i = 0; i < 64; i++) {
    const t1 = (k + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i]! + w[i]!) | 0;
    const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
    k = g;
    g = f;
    f = e;
    e = (d + t1) | 0;
    d = c;
    c = b;
    b = a;
    a = (t1 + t2) | 0;
  }
  h[0] = h[0]! + a;
  h[1] = h[1]! + b;
  h[2] = h[2]! + c;
  h[3] = h[3]! + d;
  h[4] = h[4]! + e;
  h[5] = h[5]! + f;
  h[6] = h[6]! + g;
  h[7] = h[7]! + k;
}

/**
 * The pure-JS SHA-256 stream (FIPS 180-4): the browser's path, since WebCrypto's `subtle.digest` has no streaming
 * form. Partial blocks carry across chunk boundaries; the length is a 64-bit bit count (a byte count up to 2^53).
 */
export function sha256Pure(): Sha256Stream {
  const h = new Uint32Array(H0);
  const w = new Uint32Array(64);
  const block = new Uint8Array(64);
  let fill = 0;
  let bytes = 0;
  let finished = false;
  const done = (): DigestError => new DigestError("STREAM_DONE", "This SHA-256 stream has already been digested.");
  const update = (chunk: Uint8Array): void => {
    if (finished) throw done();
    const n = chunk.length;
    let i = 0;
    bytes += n;
    if (fill > 0) {
      i = Math.min(64 - fill, n);
      block.set(chunk.subarray(0, i), fill);
      fill += i;
      if (fill < 64) return;
      compress(h, w, block, 0);
      fill = 0;
    }
    for (; i + 64 <= n; i += 64) compress(h, w, chunk, i);
    if (i < n) {
      block.set(chunk.subarray(i), 0);
      fill = n - i;
    }
  };
  return {
    update,
    async digestHex() {
      if (finished) throw done();
      // 5.1.1: a 1 bit, zeros to 56 mod 64, then the message's length in bits as a 64-bit big-endian integer.
      const pad = new Uint8Array((fill < 56 ? 64 : 128) - fill);
      pad[0] = 0x80;
      const view = new DataView(pad.buffer);
      view.setUint32(pad.length - 8, Math.floor(bytes / 0x20000000));
      view.setUint32(pad.length - 4, (bytes % 0x20000000) * 8);
      update(pad);
      finished = true;
      return Array.from(h, (x) => x.toString(16).padStart(8, "0")).join("");
    },
  };
}

/**
 * An incremental SHA-256: the explicit factory, else the injected one (`setSha256StreamFallback`), else
 * `node:crypto`'s where the host has it, else the pure-JS stream (the browser's). Each digests once.
 */
export function createSha256(factory?: Sha256StreamFactory): Sha256Stream {
  const inner = (factory ?? streamFallback ?? nodeStream() ?? sha256Pure)();
  let finished = false;
  const done = (): DigestError => new DigestError("STREAM_DONE", "This SHA-256 stream has already been digested.");
  return {
    update(chunk) {
      if (finished) throw done();
      inner.update(chunk);
    },
    digestHex() {
      if (finished) return Promise.reject(done());
      finished = true;
      return inner.digestHex();
    },
  };
}

/** Order by UTF-8 bytes, which is Unicode code point order. */
export function compareUtf8(a: string, b: string): number {
  const ai = a[Symbol.iterator]();
  const bi = b[Symbol.iterator]();
  for (;;) {
    const x = ai.next();
    const y = bi.next();
    if (x.done || y.done) return x.done && y.done ? 0 : x.done ? -1 : 1;
    const cx = x.value.codePointAt(0)!;
    const cy = y.value.codePointAt(0)!;
    if (cx !== cy) return cx < cy ? -1 : 1;
  }
}

function canonical(value: unknown, at: string): string {
  if (value === null || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new DigestError("NOT_CANONICAL", `${at} is not a finite number`);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v, i) => {
      if (v === undefined) throw new DigestError("NOT_CANONICAL", `${at}[${i}] is undefined`);
      return canonical(v, `${at}[${i}]`);
    }).join(",")}]`;
  }
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const keys = Object.keys(value as object).filter((k) => (value as Record<string, unknown>)[k] !== undefined).sort(compareUtf8);
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k], `${at}.${k}`)}`).join(",")}}`;
  }
  throw new DigestError("NOT_CANONICAL", `${at} is not plain JSON data`);
}

/** Canonical JSON: plain objects with keys in UTF-8 byte order, no whitespace, undefined properties left out. */
export function canonicalJson(value: unknown): string {
  return canonical(value, "$");
}

export interface MemberHash {
  path: string;
  sha256: string;
}
const HEX64 = /^[0-9a-f]{64}$/;

/** The member table: NFC paths in UTF-8 byte order, each with its SHA-256; a normalization collision is refused. */
export function memberTable(members: readonly MemberHash[]): [string, string][] {
  const seen = new Set<string>();
  const table: [string, string][] = [];
  for (const m of members) {
    if (!HEX64.test(m.sha256)) throw new DigestError("HASH_INVALID", `${m.path}: sha256 must be 64 lower-case hex digits`);
    const path = m.path.normalize("NFC");
    if (seen.has(path)) throw new DigestError("PATH_COLLISION", `${path}: two members normalise to one path`);
    seen.add(path);
    table.push([path, m.sha256]);
  }
  return table.sort((a, b) => compareUtf8(a[0], b[0]));
}

const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

/** SHA-256 of the canonical member table (`{"digest":"s2u.pack-members","members":[[path,sha256]...],"version":1}`). */
export function memberDigest(members: readonly MemberHash[], hash?: Sha256): Promise<string> {
  return sha256Hex(utf8(canonicalJson({ digest: "s2u.pack-members", version: 1, members: memberTable(members) })), hash);
}

/** A set held as a list, in canonical order: each element by its canonical JSON in UTF-8 byte order. */
const asSet = (list: unknown, each: (v: unknown) => unknown = (v) => v): unknown =>
  Array.isArray(list)
    ? list
        .map(each)
        .map((v) => [canonicalJson(v), v] as const)
        .sort((a, b) => compareUtf8(a[0], b[0]))
        .map(([, v]) => v)
    : list;
/** An object row with one of its fields, a list, taken as a set. */
const withSet = (field: string) => (v: unknown): unknown =>
  v !== null && typeof v === "object" && !Array.isArray(v) && field in v ? { ...v, [field]: asSet((v as Record<string, unknown>)[field]) } : v;

/**
 * The pack hash of `PackRef`: SHA-256 of `{"digest":"s2u.pack","manifest":...,"version":1}`, the manifest canonical
 * with its `files` rows NFC and in UTF-8 path order (the member table), and its sets in canonical order -- `kinds`,
 * `dependencies`, `intents` (each one's `files` too) and `handlers` (each one's `actions` too) -- so the author's
 * order never makes a second pack. The caller's manifest is not changed.
 */
export function packDigest(manifest: { readonly files: readonly MemberHash[] }, hash?: Sha256): Promise<string> {
  const order = new Map(memberTable(manifest.files).map(([p], i) => [p, i]));
  const files = manifest.files.map((f) => ({ ...f, path: f.path.normalize("NFC") })).sort((a, b) => order.get(a.path)! - order.get(b.path)!);
  const sets: Record<string, unknown> = {};
  const m = manifest as unknown as Record<string, unknown>;
  if ("kinds" in m) sets.kinds = asSet(m.kinds);
  if ("dependencies" in m) sets.dependencies = asSet(m.dependencies);
  if ("intents" in m) sets.intents = asSet(m.intents, withSet("files"));
  if ("handlers" in m) sets.handlers = asSet(m.handlers, withSet("actions"));
  return sha256Hex(utf8(canonicalJson({ digest: "s2u.pack", version: 1, manifest: { ...manifest, ...sets, files } })), hash);
}
