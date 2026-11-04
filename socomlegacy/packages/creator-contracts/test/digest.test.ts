import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  compareUtf8,
  createSha256,
  DigestError,
  memberDigest,
  memberTable,
  packDigest,
  setSha256StreamFallback,
  sha256Hex,
  sha256Pure,
  type Sha256,
  type Sha256StreamFactory,
} from "../src/index.js";

/** The Node path: node:crypto behind the same injectable the browser's WebCrypto fills. */
const nodeSha256: Sha256 = async (bytes) => new Uint8Array(createHash("sha256").update(bytes).digest());
const r = (c: string): string => c.repeat(64);

/** Golden vector 1: computed outside the package (node:crypto over the hand-written canonical text). */
const MEMBERS_GOLDEN = "ce0fbb488d40ea85e29bd75d4096d436e51472ac3b9bc03024e0cafd9100f0b8";
const MEMBERS_CANONICAL =
  '{"digest":"s2u.pack-members","members":[' +
  `["Z.txt","${r("1")}"],["a/é.txt","${r("2")}"],["b.txt","${r("3")}"],["～.txt","${r("4")}"],["\u{1f600}.txt","${r("5")}"]` +
  '],"version":1}';
/** Author order, an NFD spelling of e-acute, and the astral / BMP pair UTF-16 ordering would swap. */
const GOLDEN_MEMBERS = [
  { path: "\u{1f600}.txt", sha256: r("5") },
  { path: "b.txt", sha256: r("3") },
  { path: "a/é.txt", sha256: r("2") },
  { path: "～.txt", sha256: r("4") },
  { path: "Z.txt", sha256: r("1") },
];
/** Golden vector 2: the pack hash of a two-file manifest, files given out of order. */
const PACK_GOLDEN = "070180caff2ad5c672f66c286770cb636c62e68da464d92740080e04328e09d1";
const GOLDEN_MANIFEST = {
  format: "s2u-pack",
  formatVersion: 2,
  id: "example.golden",
  version: "1.0.0",
  name: "Golden",
  target: "socom2-us-r0001",
  contract: "^1.0.0",
  kinds: ["content"],
  sides: "both",
  dependencies: [],
  files: [
    { path: "b.png", sha256: r("b"), size: 3, role: "texture" },
    { path: "a.json", sha256: r("a"), size: 2, role: "gameplay" },
  ],
  intents: [
    { kind: "gameplay-value", files: ["a.json"] },
    { kind: "cosmetic", files: ["b.png"] },
  ],
} as const;

describe("canonical pack digest (browser adaptation)", () => {
  it("orders by UTF-8 bytes, never localeCompare or UTF-16 units", () => {
    expect(compareUtf8("Z", "a")).toBeLessThan(0);
    expect(compareUtf8("～", "\u{1f600}")).toBeLessThan(0);
    expect("\u{1f600}" < "～").toBe(true); // UTF-16 order disagrees: the reason for compareUtf8
    expect(compareUtf8("a", "a")).toBe(0);
    expect(compareUtf8("ab", "a")).toBeGreaterThan(0);
  });

  it("serialises canonically: keys by byte order, no whitespace, undefined properties dropped", () => {
    expect(canonicalJson({ b: 1, a: [true, null, "x"], c: undefined, Z: { y: 2, x: 1 } })).toBe('{"Z":{"x":1,"y":2},"a":[true,null,"x"],"b":1}');
    expect(() => canonicalJson({ n: Number.NaN })).toThrow(DigestError);
    expect(() => canonicalJson([undefined])).toThrow(DigestError);
    expect(() => canonicalJson({ d: new Date(0) })).toThrow(DigestError);
  });

  it("builds the member table from NFC paths in byte order and refuses a normalization collision", () => {
    expect(memberTable(GOLDEN_MEMBERS).map(([p]) => p)).toEqual(["Z.txt", "a/é.txt", "b.txt", "～.txt", "\u{1f600}.txt"]);
    const clash = [
      { path: "café.json", sha256: r("1") },
      { path: "café.json", sha256: r("2") },
    ];
    expect(() => memberTable(clash)).toThrow(expect.objectContaining({ code: "PATH_COLLISION" }));
    expect(() => memberTable([{ path: "a", sha256: "nope" }])).toThrow(expect.objectContaining({ code: "HASH_INVALID" }));
  });

  it("pins golden vector 1 (members) identically through WebCrypto and node:crypto", async () => {
    expect(canonicalJson({ digest: "s2u.pack-members", version: 1, members: memberTable(GOLDEN_MEMBERS) })).toBe(MEMBERS_CANONICAL);
    expect(await memberDigest(GOLDEN_MEMBERS)).toBe(MEMBERS_GOLDEN);
    expect(await memberDigest(GOLDEN_MEMBERS, nodeSha256)).toBe(MEMBERS_GOLDEN);
  });

  it("pins golden vector 2 (pack hash) with files sorted and the same through both digests", async () => {
    expect(await packDigest(GOLDEN_MANIFEST)).toBe(PACK_GOLDEN);
    expect(await packDigest(GOLDEN_MANIFEST, nodeSha256)).toBe(PACK_GOLDEN);
    const reordered = { ...GOLDEN_MANIFEST, files: [...GOLDEN_MANIFEST.files].reverse() };
    expect(await packDigest(reordered)).toBe(PACK_GOLDEN);
  });

  it("keeps the pack hash free of the author's order for the manifest's sets, and moves it for a changed requirement", async () => {
    const base = {
      ...GOLDEN_MANIFEST,
      kinds: ["content", "rules"],
      dependencies: [
        { id: "example.yard", range: "^1.0.0" },
        { archive: "RUN/MP51.ZDB", sha256: r("d") },
      ],
      files: [
        { path: "a.json", sha256: r("a"), size: 2, role: "gameplay" },
        { path: "b.png", sha256: r("b"), size: 3, role: "texture" },
        { path: "c.png", sha256: r("c"), size: 3, role: "texture" },
      ],
      intents: [
        { kind: "gameplay-value", files: ["a.json"] },
        { kind: "cosmetic", files: ["b.png", "c.png"] },
      ],
      handlers: [
        { slot: "mode.rules", handler: "rules.declarative", actions: ["round.end", "score.add"] },
        { slot: "render.water", handler: "system.ocean" },
      ],
    };
    const permuted = {
      ...base,
      kinds: ["rules", "content"],
      dependencies: [...base.dependencies].reverse(),
      files: [...base.files].reverse(),
      intents: [
        { kind: "cosmetic", files: ["c.png", "b.png"] },
        { kind: "gameplay-value", files: ["a.json"] },
      ],
      handlers: [
        { slot: "render.water", handler: "system.ocean" },
        { slot: "mode.rules", handler: "rules.declarative", actions: ["score.add", "round.end"] },
      ],
    };
    const hash = await packDigest(base, nodeSha256);
    expect(await packDigest(permuted, nodeSha256)).toBe(hash);
    expect(await packDigest(permuted)).toBe(hash);
    const tighter = { ...base, dependencies: [{ id: "example.yard", range: "^1.2.0" }, base.dependencies[1]!] };
    expect(await packDigest(tighter, nodeSha256)).not.toBe(hash);
    // The caller's manifest is not reordered in place.
    expect(permuted.kinds).toEqual(["rules", "content"]);
  });

  it("hashes exactly the given view, not its backing buffer: a Buffer subview over Node's pool", async () => {
    // Buffer.from(string) and Buffer.concat allocate out of a shared pool, so `bytes.buffer` is larger than the view
    // and `bytes.slice()` on a Buffer is a view too. The default WebCrypto path must hash the view's bytes only.
    const pool = Buffer.from("prefix-" + "payload-bytes" + "-suffix", "utf8");
    const view = pool.subarray(7, 7 + "payload-bytes".length);
    expect(view.buffer.byteLength).toBeGreaterThan(view.byteLength);
    const expected = createHash("sha256").update(Buffer.from("payload-bytes", "utf8")).digest("hex");
    expect(await sha256Hex(view)).toBe(expected);
    expect(await sha256Hex(view, nodeSha256)).toBe(expected);
  });

  it("hashes bytes to lower-case hex, with the empty vector", async () => {
    const empty = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
    expect(await sha256Hex(new Uint8Array(0))).toBe(empty);
    expect(await sha256Hex(new Uint8Array(0), nodeSha256)).toBe(empty);
  });
});

/** The Node path of the stream: node:crypto's incremental hash behind the stream injectable. */
const nodeStream: Sha256StreamFactory = () => {
  const h = createHash("sha256");
  return { update: (chunk) => void h.update(chunk), digestHex: async () => h.digest("hex") };
};
/** Every stream path, the pure-JS one named explicitly: the browser has no other (WebCrypto has no streaming digest). */
const STREAMS: readonly (readonly [string, Sha256StreamFactory | undefined])[] = [
  ["pure-JS (sha256Pure)", sha256Pure],
  ["node:crypto (injected)", nodeStream],
  ["the default", undefined],
];
async function streamHex(bytes: Uint8Array, step: number, factory?: Sha256StreamFactory): Promise<string> {
  const s = createSha256(factory);
  for (let i = 0; i < bytes.length; i += step) s.update(bytes.subarray(i, i + step));
  return s.digestHex();
}
/** A seeded generator (mulberry32): the same bytes every run, never Math.random. */
function seeded(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length);
  let a = seed >>> 0;
  for (let i = 0; i < length; i++) {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    out[i] = ((t ^ (t >>> 14)) >>> 0) & 0xff;
  }
  return out;
}
/** The exact bytes a digest hashes, caught through the injectable `Sha256`. */
async function bytesOf(run: (hash: Sha256) => Promise<string>): Promise<Uint8Array> {
  let caught: Uint8Array | null = null;
  await run(async (bytes) => {
    caught = new Uint8Array(bytes);
    return new Uint8Array(createHash("sha256").update(bytes).digest());
  });
  return caught!;
}

describe("incremental SHA-256 (browser adaptation)", () => {
  const EMPTY = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  const ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

  for (const [name, factory] of STREAMS) {
    it(`hashes the FIPS 180-4 vectors through ${name}`, async () => {
      expect(await streamHex(new Uint8Array(0), 64, factory)).toBe(EMPTY);
      expect(await streamHex(new TextEncoder().encode("abc"), 1, factory)).toBe(ABC);
      const two = new TextEncoder().encode("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq");
      expect(await streamHex(two, 7, factory)).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
    });

    it(`reproduces both golden vectors in 1-, 7- and 64-byte chunks through ${name}`, async () => {
      const members = await bytesOf((hash) => memberDigest(GOLDEN_MEMBERS, hash));
      expect(new TextDecoder().decode(members)).toBe(MEMBERS_CANONICAL);
      const pack = await bytesOf((hash) => packDigest(GOLDEN_MANIFEST, hash));
      for (const step of [1, 7, 64]) {
        expect(await streamHex(members, step, factory), `members, ${step}`).toBe(MEMBERS_GOLDEN);
        expect(await streamHex(pack, step, factory), `pack, ${step}`).toBe(PACK_GOLDEN);
      }
    });

    it(`equals sha256Hex over a seeded 1 MiB buffer hashed in 4096-byte chunks through ${name}`, async () => {
      const big = seeded(1024 * 1024, 0x5c0c0275);
      const whole = await sha256Hex(big);
      expect(whole).toBe(createHash("sha256").update(big).digest("hex"));
      expect(await streamHex(big, 4096, factory)).toBe(whole);
    });

    it(`pads at every block boundary through ${name}`, async () => {
      for (const n of [1, 55, 56, 57, 63, 64, 65, 119, 120, 127, 128, 129]) {
        const bytes = seeded(n, n);
        const expected = createHash("sha256").update(bytes).digest("hex");
        expect(await streamHex(bytes, n, factory), `${n} whole`).toBe(expected);
        expect(await streamHex(bytes, 13, factory), `${n} by 13`).toBe(expected);
      }
    });
  }

  it("hashes exactly a Buffer subview's bytes through the pure-JS stream", async () => {
    const pool = Buffer.from("prefix-" + "payload-bytes" + "-suffix", "utf8");
    const view = pool.subarray(7, 7 + "payload-bytes".length);
    expect(await streamHex(view, 5, sha256Pure)).toBe(createHash("sha256").update("payload-bytes").digest("hex"));
  });

  it("carries a 64-bit length: a message past 2^32 bits (512 MiB) through the pure-JS stream", async () => {
    // One reused 1 MiB chunk, so the test holds 1 MiB however long the message is; 512 MiB + 3 bytes puts the
    // length's high word at 1 and its low word at 24, which a 32-bit length would get wrong.
    const chunk = seeded(1024 * 1024, 0x2f00d);
    const pure = createSha256(sha256Pure);
    const node = createHash("sha256");
    for (let i = 0; i < 512; i++) {
      pure.update(chunk);
      node.update(chunk);
    }
    pure.update(chunk.subarray(0, 3));
    node.update(chunk.subarray(0, 3));
    expect(await pure.digestHex()).toBe(node.digest("hex"));
  }, 180_000);

  it("prefers an explicit factory, then the injected stream, and clears it with null", async () => {
    let made = 0;
    const counted: Sha256StreamFactory = () => (made++, sha256Pure());
    try {
      setSha256StreamFallback(counted);
      expect(await streamHex(new TextEncoder().encode("abc"), 2)).toBe(ABC);
      expect(made).toBe(1);
      expect(await streamHex(new TextEncoder().encode("abc"), 2, nodeStream)).toBe(ABC);
      expect(made).toBe(1);
      setSha256StreamFallback(null);
      expect(await streamHex(new TextEncoder().encode("abc"), 2)).toBe(ABC);
      expect(made).toBe(1);
    } finally {
      setSha256StreamFallback(null);
    }
  });

  it("digests once: a second digest or a later update is refused", async () => {
    for (const [, factory] of STREAMS) {
      const s = createSha256(factory);
      s.update(new Uint8Array([1, 2, 3]));
      await s.digestHex();
      await expect(s.digestHex()).rejects.toMatchObject({ code: "STREAM_DONE" });
      expect(() => s.update(new Uint8Array(1))).toThrow(DigestError);
    }
    const bare = sha256Pure();
    expect(await bare.digestHex()).toBe(EMPTY);
    await expect(bare.digestHex()).rejects.toMatchObject({ code: "STREAM_DONE" });
    expect(() => bare.update(new Uint8Array(1))).toThrow(DigestError);
  });
});
