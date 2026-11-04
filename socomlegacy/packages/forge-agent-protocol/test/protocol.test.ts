import { describe, it, expect } from "vitest";
import {
  LIMITS,
  parseRequest,
  authorizeRequest,
  ChunkAssembler,
  encodeFrames,
  FrameReceiver,
  ProtocolError,
  decodeBase64,
  encodeBase64,
} from "../src/index.js";
function thrown(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error("expected a throw");
}
const req = {
  version: 1,
  requestId: "r",
  sessionId: "s",
  targetId: "t",
  epoch: "e",
  operation: "forge.read",
  args: {},
};
describe("browser adaptation protocol", () => {
  it('discovers starters with inspect permission and applies only with import permission in the editor', () => {
    const cap = { sessionId: 's', targetId: 't', epoch: 'e', revision: 7, surface: 'forge-editor' as const, permissions: ['inspect'] as const };
    for (const operation of ['forge.starters', 'forge.starter.preview']) expect(authorizeRequest(parseRequest({ ...req, operation, args: { id: 'arena' } }), cap)).toBeUndefined();
    const apply = parseRequest({ ...req, operation: 'forge.starter.apply', args: { id: 'arena' }, expectedRevision: 7 });
    expect(authorizeRequest(apply, cap)).toBe('PERMISSION_DENIED');
    expect(authorizeRequest(apply, { ...cap, permissions: ['import'] })).toBeUndefined();
    expect(authorizeRequest(apply, { ...cap, surface: 'forge-play', permissions: ['import'] })).toBe('SURFACE_DENIED');
    expect(authorizeRequest(apply, { ...cap, revision: 8, permissions: ['import'] })).toBe('REVISION_CONFLICT');
  });
  it("admits only test-granted private Play inputs", () => {
    const request = parseRequest({ ...req, operation: 'forge.input', expectedRevision: 1 });
    const cap = { sessionId: 's', targetId: 't', epoch: 'e', surface: 'forge-play' as const, permissions: ['test'] as const };
    expect(authorizeRequest(request, cap)).toBeUndefined();
    expect(authorizeRequest(request, { ...cap, permissions: ['edit'] as const })).toBe('PERMISSION_DENIED');
  });
  it("frames large Unicode controls within negotiated bounds and rejects reordered frames", () => {
    const value = { text: "🎮".repeat(9000) };
    const frames = encodeFrames(value, 4096);
    expect(frames.length).toBeGreaterThan(2);
    expect(
      frames.every((f) => new TextEncoder().encode(f).length <= 4096),
    ).toBe(true);
    const receiver = new FrameReceiver();
    let result: unknown;
    for (const frame of frames) result = receiver.push(frame) ?? result;
    expect(result).toEqual(value);
    const broken = new FrameReceiver();
    broken.push(frames[0]!);
    expect(() => broken.push(frames[2]!)).toThrow("CHUNK_ORDER");
    expect(() =>
      encodeFrames({ text: "x".repeat(LIMITS.controlBytes) }),
    ).toThrow();
  });
  it("rejects incompatible, missing, unknown and oversized controls", () => {
    expect(parseRequest(req)).toEqual(req);
    for (const bad of [
      { ...req, version: 2 },
      { ...req, targetId: "" },
      { ...req, operation: "eval" },
      { ...req, args: "x".repeat(LIMITS.controlBytes) },
    ])
      expect(() => parseRequest(bad)).toThrow();
    expect(() => parseRequest({ ...req, operation: "forge.edit" })).toThrow();
  });
  it("requires exact session, epoch, grant, surface and revision", () => {
    const cap = {
      sessionId: "s",
      targetId: "t",
      epoch: "e",
      permissions: ["inspect"] as const,
      surface: "forge-editor" as const,
      revision: 0,
    };
    expect(authorizeRequest(parseRequest(req), cap)).toBeUndefined();
    expect(authorizeRequest(parseRequest({ ...req, epoch: "old" }), cap)).toBe(
      "STALE_EPOCH",
    );
    expect(
      authorizeRequest(parseRequest(req), { ...cap, permissions: [] }),
    ).toBe("PERMISSION_DENIED");
    expect(
      authorizeRequest(
        parseRequest({ ...req, operation: "forge.edit", expectedRevision: 0 }),
        { ...cap, permissions: ["edit"], revision: 1 },
      ),
    ).toBe("REVISION_CONFLICT");
  });
  it("bounds chunks and refuses replay, incomplete and expired transfers", () => {
    let now = 0;
    const a = new ChunkAssembler(() => now);
    a.begin("x", 3);
    a.chunk("x", 0, new Uint8Array([1, 2]));
    expect(() => a.finish("x")).toThrow("INCOMPLETE");
    expect(() => a.chunk("x", 0, new Uint8Array([1]))).toThrow("CHUNK_ORDER");
    a.chunk("x", 1, new Uint8Array([3]));
    expect(a.finish("x")).toEqual(new Uint8Array([1, 2, 3]));
    expect(() => a.begin("x", LIMITS.transferBytes + 1)).toThrow();
    a.begin("x", 1);
    now = LIMITS.transferIdleMs + 1;
    expect(() => a.chunk("x", 0, new Uint8Array([1]))).toThrow(
      "TRANSFER_EXPIRED",
    );
  });
  // Browser adaptation: a transfer abandoned past its expiry never wedges the next one on the same assembler.
  it("evicts an expired held transfer at begin and keeps a live one busy", () => {
    let now = 0;
    const a = new ChunkAssembler(() => now);
    a.begin("a", 3);
    now = LIMITS.transferIdleMs + 1;
    a.begin("b", 1);
    a.chunk("b", 0, new Uint8Array([7]));
    expect(a.finish("b")).toEqual(new Uint8Array([7]));
    expect(() => a.chunk("a", 0, new Uint8Array([1]))).toThrow("NO_TRANSFER");

    now = 0;
    const live = new ChunkAssembler(() => now);
    live.begin("a", 3);
    now = LIMITS.transferIdleMs - 1;
    live.chunk("a", 0, new Uint8Array([1]));
    now += LIMITS.transferIdleMs - 1;
    expect(thrown(() => live.begin("b", 1))).toMatchObject({ code: "TRANSFER_BUSY" });
    live.chunk("a", 1, new Uint8Array([2, 3]));
    expect(live.finish("a")).toEqual(new Uint8Array([1, 2, 3]));

    now = 0;
    const steady = new ChunkAssembler(() => now);
    steady.begin("a", LIMITS.transferBytes);
    let index = 0;
    // Chunks inside the idle window until the absolute bound passes: the held transfer is then evictable.
    while (now <= LIMITS.transferAbsoluteMs) {
      steady.chunk("a", index++, new Uint8Array([1]));
      now += LIMITS.transferIdleMs - 1;
    }
    expect(now - (LIMITS.transferIdleMs - 1)).toBeLessThanOrEqual(LIMITS.transferAbsoluteMs);
    steady.begin("b", 1);
  });
  it("a frame stream abandoned after frame.begin and a chunk does not refuse the next reply", () => {
    let now = 0;
    const receiver = new FrameReceiver(() => now);
    const stalled = encodeFrames({ text: "x".repeat(30000) });
    receiver.push(stalled[0]!);
    receiver.push(stalled[1]!);
    now = LIMITS.transferIdleMs + 1;
    const next = encodeFrames({ text: "y".repeat(30000) });
    let result: unknown;
    for (const frame of next) result = receiver.push(frame) ?? result;
    expect(result).toEqual({ text: "y".repeat(30000) });
  });
  // Browser adaptation: refusals carry a machine code the page targets map to an agent-visible code.
  it("throws refusals as ProtocolError with the code as both .code and message", () => {
    const a = new ChunkAssembler(() => 0);
    a.begin("x", 3);
    const order = thrown(() => a.chunk("x", 1, new Uint8Array([1])));
    expect(order).toBeInstanceOf(ProtocolError);
    expect(order).toMatchObject({ code: "CHUNK_ORDER", message: "CHUNK_ORDER", name: "ProtocolError" });
    const base64 = thrown(() => decodeBase64("not base64!"));
    expect(base64).toBeInstanceOf(ProtocolError);
    expect(base64).toMatchObject({ code: "INVALID_BASE64", message: "INVALID_BASE64" });
    expect(thrown(() => parseRequest({ ...req, targetId: "" }))).toMatchObject({ code: "INVALID_targetId" });
  });
});

describe("FrameReceiver eviction on the ordered channel", () => {
  it("an abandoned frame set inside the idle window does not refuse the next reply", () => {
    let now = 0;
    const receiver = new FrameReceiver(() => now);
    receiver.push(JSON.stringify({ type: "frame.begin", transferId: "a", size: 4000 }));
    receiver.push(JSON.stringify({ type: "frame.chunk", transferId: "a", index: 0, data: encodeBase64(new Uint8Array(1000)) }));
    now = 1100;
    const frames = encodeFrames({ reply: "b".repeat(20000) }, 4096);
    let value: unknown;
    for (const frame of frames) value = receiver.push(frame);
    expect(value).toEqual({ reply: "b".repeat(20000) });
  });
});
