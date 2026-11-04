/**
 * **An incremental SHA-256** for the extraction (front-end plan `docs/plans/2026-10-16-front-end-pad-and-disc.md`, DX-1,
 * FI.R6): each file's hash is taken as its bytes stream through the writer, a chunk at a time, so a 577 MB
 * `VAGSTORE.ZAR` is hashed without being held. `crypto.subtle.digest` takes its input whole and has no streaming form,
 * so this is the standard's own algorithm (FIPS 180-4 §6.2, the constants of §4.2.2 and §5.3.3), written out: the
 * digest is the file's true SHA-256 -- equal to `crypto.subtle`'s and `sha256sum`'s over the whole file, which the test
 * holds -- not a hash of per-chunk hashes. A **browser adaptation** (FI.R2): nothing of the game.
 */

/** FIPS 180-4 §4.2.2: the first 32 bits of the fractional parts of the cube roots of the first 64 primes. */
const K = new Int32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** FIPS 180-4 §5.3.3: the initial hash value. */
const H0 = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];

/** SHA-256 over bytes given in any number of `update`s; `hex()` ends it. */
export class Sha256 {
  private readonly h = new Int32Array(H0);
  private readonly w = new Int32Array(64);
  private readonly block = new Uint8Array(64);
  private fill = 0;
  /** Bytes taken so far (exact to 2^53, far past any disc). */
  private length = 0;
  private finished: string | null = null;

  update(bytes: Uint8Array): this {
    if (this.finished !== null) throw new Error('SHA-256: update after the digest was taken');
    this.length += bytes.length;
    let at = 0;
    if (this.fill > 0) {
      const n = Math.min(64 - this.fill, bytes.length);
      this.block.set(bytes.subarray(0, n), this.fill);
      this.fill += n;
      at = n;
      if (this.fill < 64) return this;
      this.compress(this.block, 0);
      this.fill = 0;
    }
    for (; at + 64 <= bytes.length; at += 64) this.compress(bytes, at);
    if (at < bytes.length) {
      this.block.set(bytes.subarray(at), 0);
      this.fill = bytes.length - at;
    }
    return this;
  }

  /** The digest as 64 lower-case hex digits. The hash takes nothing more after it; asked again, the same answer. */
  hex(): string {
    if (this.finished !== null) return this.finished;
    // §5.1.1: a 1 bit, zeros to 56 bytes mod 64, then the length in bits as a 64-bit big-endian number.
    const bits = this.length * 8;
    const block = this.block;
    block[this.fill++] = 0x80;
    if (this.fill > 56) {
      block.fill(0, this.fill);
      this.compress(block, 0);
      this.fill = 0;
    }
    block.fill(0, this.fill, 56);
    const high = Math.floor(bits / 0x100000000);
    const low = bits >>> 0;
    block[56] = high >>> 24; block[57] = high >>> 16; block[58] = high >>> 8; block[59] = high;
    block[60] = low >>> 24; block[61] = low >>> 16; block[62] = low >>> 8; block[63] = low;
    this.compress(block, 0);
    let out = '';
    for (const word of this.h) out += (word >>> 0).toString(16).padStart(8, '0');
    this.finished = out;
    return out;
  }

  /** §6.2.2: one 64-byte block at `at`. */
  private compress(data: Uint8Array, at: number): void {
    const w = this.w;
    for (let i = 0; i < 16; i++) {
      const j = at + i * 4;
      w[i] = (data[j]! << 24) | (data[j + 1]! << 16) | (data[j + 2]! << 8) | data[j + 3]!;
    }
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15]!;
      const b = w[i - 2]!;
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) | 0;
    }
    const h = this.h;
    let a = h[0]!, b = h[1]!, c = h[2]!, d = h[3]!, e = h[4]!, f = h[5]!, g = h[6]!, k = h[7]!;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const ch = (e & f) ^ (~e & g);
      const t1 = (k + S1 + ch + K[i]! + w[i]!) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) | 0;
      k = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0]! + a) | 0; h[1] = (h[1]! + b) | 0; h[2] = (h[2]! + c) | 0; h[3] = (h[3]! + d) | 0;
    h[4] = (h[4]! + e) | 0; h[5] = (h[5]! + f) | 0; h[6] = (h[6]! + g) | 0; h[7] = (h[7]! + k) | 0;
  }
}

/**
 * A `Blob`'s SHA-256, read `chunk` bytes at a time (one chunk held), `cancelled` read before each chunk (an `AbortError`
 * then). `onChunk` hears the bytes hashed so far. What `verify` and the IndexedDB writer use; the OPFS worker hashes
 * the bytes it writes through `Sha256` directly.
 */
export async function hashBlob(
  blob: Blob, chunk: number, cancelled: () => boolean = () => false, onChunk?: (done: number) => void,
): Promise<string> {
  return (await feedBlob(new Sha256(), blob, chunk, cancelled, onChunk)).hex();
}

/**
 * `blob`'s bytes fed to `hash` in order, `chunk` at a time (one chunk held), as `hashBlob` reads them: the hash is left
 * open, so a streamed write resumed mid-file (DSH-2, `./discExtractStore` `stream`, `./discExtractProtocol`
 * `openOpfsStream`) rebuilds its state by re-reading the part already stored and goes on hashing the rest.
 */
export async function feedBlob(
  hash: Sha256, blob: Blob, chunk: number, cancelled: () => boolean = () => false, onChunk?: (done: number) => void,
): Promise<Sha256> {
  if (!(chunk > 0)) throw new RangeError(`the hash's chunk is ${chunk} bytes`);
  for (let at = 0; at < blob.size; at += chunk) {
    if (cancelled()) throw new DOMException('the hash was cancelled', 'AbortError');
    const end = Math.min(at + chunk, blob.size);
    hash.update(new Uint8Array(await blob.slice(at, end).arrayBuffer()));
    onChunk?.(end);
  }
  return hash;
}
