import { it, expect, vi } from "vitest";
import { RTCPeerConnection } from "werift";
import { createRtcPeer } from "../src/rtc.js";
import {
  encodeFrames,
  FrameReceiver,
  encodeBase64,
} from "@s2u/forge-agent-protocol";
import { createHash } from "node:crypto";
it("reassembles bounded capture chunks with a digest and exposes only the completed image", async () => {
  const remote = new RTCPeerConnection({ iceServers: [], iceUseIpv6: false });
  const receiver = new FrameReceiver();
  const bytes = Buffer.alloc(70000, 42),
    digest = createHash("sha256").update(bytes).digest("hex");
  remote.onDataChannel.subscribe((channel) =>
    channel.onMessage.subscribe((raw) => {
      const m = receiver.push(raw.toString()) as
        | { request?: { requestId: string } }
        | undefined;
      if (!m?.request) return;
      const requestId = m.request.requestId,
        transferId = "capture";
      const send = (value: unknown) => {
        for (const f of encodeFrames(value)) channel.send(f);
      };
      send({
        type: "image.begin",
        requestId,
        transferId,
        size: bytes.length,
        mimeType: "image/png",
      });
      let index = 0;
      for (let offset = 0; offset < bytes.length; offset += 16384)
        send({
          type: "image.chunk",
          transferId,
          index: index++,
          data: encodeBase64(bytes.subarray(offset, offset + 16384)),
        });
      send({ type: "image.finish", transferId, digest });
      send({
        type: "result",
        result: {
          requestId,
          revision: 0,
          outcome: "ok",
          data: { image: { transferId, mimeType: "image/png" } },
        },
      });
    }),
  );
  const peer = createRtcPeer(() => {}, { iceServers: [], iceUseIpv6: false });
  try {
    await remote.setRemoteDescription({
      type: "offer",
      sdp: await peer.offer(),
    });
    await remote.setLocalDescription(await remote.createAnswer());
    await peer.answer(remote.localDescription!.sdp);
    const r = await peer.request({
      version: 1,
      requestId: "image",
      sessionId: "s",
      targetId: "t",
      epoch: "e",
      operation: "target.capture",
      args: {},
    });
    expect(r.data).toEqual({
      image: { mimeType: "image/png", data: bytes.toString("base64") },
    });
  } finally {
    await peer.close();
    await remote.close();
  }
}, 30000);
it("uses a real werift data channel for request/results and closes both peers", async () => {
  const started = performance.now(),
    cpuStart = process.cpuUsage(),
    rssStart = process.memoryUsage().rss;
  const remote = new RTCPeerConnection({ iceServers: [], iceUseIpv6: false });
  let remoteChannel!: { close(): void }, lossReason: string | undefined;
  let opened!: () => void;
  const ready = new Promise<void>((r) => (opened = r));
  remote.onDataChannel.subscribe((channel) => {
    remoteChannel = channel;
    channel.stateChanged.subscribe((state) => {
      if (state === "open") opened();
    });
    channel.onMessage.subscribe((raw) => {
      const value = JSON.parse(raw.toString());
      channel.send(
        JSON.stringify({
          type: "result",
          result: {
            requestId: value.request.requestId,
            revision: 4,
            outcome: "ok",
            data: { transport: "rtc" },
          },
        }),
      );
    });
  });
  const peer = createRtcPeer(
    () => {},
    { iceServers: [], iceUseIpv6: false },
    (reason) => {
      lossReason = reason;
    },
  );
  try {
    await remote.setRemoteDescription({
      type: "offer",
      sdp: await peer.offer(),
    });
    await remote.setLocalDescription(await remote.createAnswer());
    await peer.answer(remote.localDescription!.sdp);
    await ready;
    const result = await peer.request({
      version: 1,
      requestId: "real",
      sessionId: "s",
      targetId: "t",
      epoch: "e",
      operation: "target.status",
      args: {},
    });
    expect(result.data).toEqual({ transport: "rtc" });
    remoteChannel.close();
    await vi.waitFor(() => expect(lossReason).toBe("RTC_DISCONNECTED"));
  } finally {
    await peer.close();
    await remote.close();
    const cpu = process.cpuUsage(cpuStart);
    console.info(
      "RTC_PROBE",
      JSON.stringify({
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        wallMs: Math.round(performance.now() - started),
        cpuMs: Math.round((cpu.user + cpu.system) / 1000),
        rssDeltaBytes: process.memoryUsage().rss - rssStart,
      }),
    );
  }
}, 30000);
it("a page refusal after image.begin settles that capture only and the peer keeps serving", async () => {
  const remote = new RTCPeerConnection({ iceServers: [], iceUseIpv6: false });
  const receiver = new FrameReceiver();
  remote.onDataChannel.subscribe((channel) =>
    channel.onMessage.subscribe((raw) => {
      const m = receiver.push(raw.toString()) as
        | { request?: { requestId: string } }
        | undefined;
      if (!m?.request) return;
      const requestId = m.request.requestId;
      const send = (value: unknown) => {
        for (const f of encodeFrames(value)) channel.send(f);
      };
      if (requestId === "status") {
        send({
          type: "result",
          result: { requestId, revision: 3, outcome: "ok", data: { alive: true } },
        });
        return;
      }
      send({
        type: "image.begin",
        requestId,
        transferId: requestId + "-t",
        size: 4,
        mimeType: "image/png",
      });
      send({
        type: "image.chunk",
        transferId: requestId + "-t",
        index: 0,
        data: encodeBase64(Buffer.from([1, 2])),
      });
      // The page fails mid-stream: a refused result, then an ok result that names no image.
      send({
        type: "result",
        result:
          requestId === "refused"
            ? { requestId, revision: 1, outcome: "refused", code: "CAPTURE_FAILED" }
            : { requestId, revision: 2, outcome: "ok", data: {} },
      });
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
  const request = (requestId: string, operation: string) =>
    peer.request({
      version: 1,
      requestId,
      sessionId: "s",
      targetId: "t",
      epoch: "e",
      operation,
      args: {},
    });
  try {
    await remote.setRemoteDescription({
      type: "offer",
      sdp: await peer.offer(),
    });
    await remote.setLocalDescription(await remote.createAnswer());
    await peer.answer(remote.localDescription!.sdp);
    expect(await request("refused", "target.capture")).toEqual({
      requestId: "refused",
      revision: 1,
      outcome: "refused",
      code: "CAPTURE_FAILED",
    });
    expect(await request("incomplete", "target.capture")).toEqual({
      requestId: "incomplete",
      revision: 2,
      outcome: "unknown",
      code: "INCOMPLETE_IMAGE",
    });
    expect(await request("status", "target.status")).toMatchObject({
      outcome: "ok",
      data: { alive: true },
    });
    expect(lossReason).toBeUndefined();
  } finally {
    await peer.close();
    await remote.close();
  }
}, 30000);
it("late image frames after a page refusal are dropped and a following capture succeeds", async () => {
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
        send({ type: "result", result: { requestId, revision: 3, outcome: "ok", data: { alive: true } } });
        return;
      }
      const transferId = requestId + "-t";
      send({ type: "image.begin", requestId, transferId, size: bytes.length, mimeType: "image/png" });
      send({ type: "image.chunk", transferId, index: 0, data: encodeBase64(bytes.subarray(0, 2)) });
      if (requestId === "refused")
        send({ type: "result", result: { requestId, revision: 1, outcome: "refused", code: "CAPTURE_FAILED" } });
      // The refused capture's remaining frames arrive after its result.
      send({ type: "image.chunk", transferId, index: 1, data: encodeBase64(bytes.subarray(2)) });
      send({ type: "image.finish", transferId, digest });
      if (requestId !== "refused")
        send({
          type: "result",
          result: { requestId, revision: 2, outcome: "ok", data: { image: { transferId, mimeType: "image/png" } } },
        });
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
  const request = (requestId: string, operation: string) =>
    peer.request({ version: 1, requestId, sessionId: "s", targetId: "t", epoch: "e", operation, args: {} });
  try {
    await remote.setRemoteDescription({ type: "offer", sdp: await peer.offer() });
    await remote.setLocalDescription(await remote.createAnswer());
    await peer.answer(remote.localDescription!.sdp);
    expect(await request("refused", "target.capture")).toEqual({
      requestId: "refused",
      revision: 1,
      outcome: "refused",
      code: "CAPTURE_FAILED",
    });
    expect(await request("next", "target.capture")).toEqual({
      requestId: "next",
      revision: 2,
      outcome: "ok",
      data: { image: { mimeType: "image/png", data: bytes.toString("base64") } },
    });
    expect(await request("status", "target.status")).toMatchObject({ outcome: "ok", data: { alive: true } });
    expect(lossReason).toBeUndefined();
  } finally {
    await peer.close();
    await remote.close();
  }
}, 30000);
