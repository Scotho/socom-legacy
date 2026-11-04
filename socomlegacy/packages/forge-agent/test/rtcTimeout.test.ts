import { it, expect, vi } from "vitest";
import { RTCPeerConnection } from "werift";
import { encodeBase64, encodeFrames, FrameReceiver } from "@s2u/forge-agent-protocol";
import { createHash } from "node:crypto";
import { createRtcPeer } from "../src/rtc.js";

// A short per-request budget so one request can time out while another reply is still being reassembled.
vi.mock("@s2u/forge-agent-protocol", async (importOriginal) => {
  const real = await importOriginal<typeof import("@s2u/forge-agent-protocol")>();
  return { ...real, LIMITS: Object.freeze({ ...real.LIMITS, requestMs: 3000 }) };
});

it("a timeout for one request keeps another request's multi-frame reply that is mid-assembly", async () => {
  const remote = new RTCPeerConnection({ iceServers: [], iceUseIpv6: false });
  const receiver = new FrameReceiver();
  let finishB!: () => void, begunB!: () => void;
  const bBegun = new Promise<void>((resolve) => (begunB = resolve));
  remote.onDataChannel.subscribe((channel) =>
    channel.onMessage.subscribe((raw) => {
      const m = receiver.push(raw.toString()) as
        | { request?: { requestId: string } }
        | undefined;
      if (m?.request?.requestId !== "b") return; // "a" is never answered.
      const frames = encodeFrames({
        type: "result",
        result: {
          requestId: "b",
          revision: 5,
          outcome: "ok",
          data: { blob: "x".repeat(30000) },
        },
      });
      expect(frames.length).toBeGreaterThan(3);
      channel.send(frames[0]!); // frame.begin
      channel.send(frames[1]!); // first chunk
      finishB = () => {
        for (const f of frames.slice(2)) channel.send(f);
      };
      begunB();
    }),
  );
  let lossReason: string | undefined;
  const peer = createRtcPeer(
    () => {},
    { iceServers: [], iceUseIpv6: false },
    (reason) => {
      lossReason = reason;
    },
  );
  const request = (requestId: string) =>
    peer.request({
      version: 1,
      requestId,
      sessionId: "s",
      targetId: "t",
      epoch: "e",
      operation: "target.status",
      args: {},
    });
  try {
    await remote.setRemoteDescription({
      type: "offer",
      sdp: await peer.offer(),
    });
    await remote.setLocalDescription(await remote.createAnswer());
    await peer.answer(remote.localDescription!.sdp);
    const a = request("a");
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const b = request("b");
    await bBegun;
    // A times out while B's frames are half delivered; only then does the page send the rest of B.
    expect(await a).toMatchObject({ outcome: "unknown", code: "REQUEST_TIMEOUT" });
    finishB();
    expect(await b).toMatchObject({
      requestId: "b",
      outcome: "ok",
      data: { blob: "x".repeat(30000) },
    });
    expect(lossReason).toBeUndefined();
  } finally {
    await peer.close();
    await remote.close();
  }
}, 30000);

// A page that answers a capture's image in two halves: the test decides when the late half is sent.
function capturePage(held: Map<string, () => void>, beginEarly: (requestId: string) => boolean) {
  const remote = new RTCPeerConnection({ iceServers: [], iceUseIpv6: false });
  const receiver = new FrameReceiver();
  const bytes = Buffer.from([1, 2, 3, 4]),
    digest = createHash("sha256").update(bytes).digest("hex");
  remote.onDataChannel.subscribe((channel) =>
    channel.onMessage.subscribe((raw) => {
      const m = receiver.push(raw.toString()) as
        | { request?: { requestId: string; operation: string } }
        | undefined;
      if (!m?.request) return;
      const { requestId, operation } = m.request;
      const send = (value: unknown) => {
        for (const f of encodeFrames(value)) channel.send(f);
      };
      if (operation !== "target.capture") {
        send({ type: "result", result: { requestId, revision: 7, outcome: "ok", data: { alive: true } } });
        return;
      }
      const transferId = requestId + "-t";
      const begin = () => {
        send({ type: "image.begin", requestId, transferId, size: bytes.length, mimeType: "image/png" });
        send({ type: "image.chunk", transferId, index: 0, data: encodeBase64(bytes.subarray(0, 2)) });
      };
      const rest = () => {
        send({ type: "image.chunk", transferId, index: 1, data: encodeBase64(bytes.subarray(2)) });
        send({ type: "image.finish", transferId, digest });
        send({
          type: "result",
          result: { requestId, revision: 7, outcome: "ok", data: { image: { transferId, mimeType: "image/png" } } },
        });
      };
      if (!held.has(requestId)) {
        begin();
        rest();
        return;
      }
      if (beginEarly(requestId)) {
        begin();
        held.set(requestId, rest);
      } else
        held.set(requestId, () => {
          begin();
          rest();
        });
    }),
  );
  return { remote, bytes };
}
async function lateCapture(beginEarly: boolean) {
  const held = new Map<string, () => void>([["late", () => {}]]);
  const { remote, bytes } = capturePage(held, () => beginEarly);
  let lossReason: string | undefined;
  const peer = createRtcPeer(
    () => {},
    { iceServers: [], iceUseIpv6: false },
    (reason) => {
      lossReason = reason;
    },
  );
  const request = (requestId: string, operation: string) =>
    peer.request({ version: 1, requestId, sessionId: "s", targetId: "t", epoch: "e", operation, args: {} });
  try {
    await remote.setRemoteDescription({ type: "offer", sdp: await peer.offer() });
    await remote.setLocalDescription(await remote.createAnswer());
    await peer.answer(remote.localDescription!.sdp);
    expect(await request("late", "target.capture")).toMatchObject({ outcome: "unknown", code: "REQUEST_TIMEOUT" });
    held.get("late")!(); // the page's late frames for the timed-out capture
    expect(await request("next", "target.capture")).toEqual({
      requestId: "next",
      revision: 7,
      outcome: "ok",
      data: { image: { mimeType: "image/png", data: bytes.toString("base64") } },
    });
    expect(await request("status", "target.status")).toMatchObject({ outcome: "ok", data: { alive: true } });
    expect(lossReason).toBeUndefined();
  } finally {
    await peer.close();
    await remote.close();
  }
}
it("late image.chunk and image.finish after a capture's timeout are dropped and the peer keeps serving", async () => {
  await lateCapture(true);
}, 30000);
it("a late image transfer for a capture that timed out before image.begin is dropped and the peer keeps serving", async () => {
  await lateCapture(false);
}, 30000);
