import {
  RTCPeerConnection,
  type RTCPeerConnectionConfig,
  type RTCIceCandidateInit,
  type RTCIceServer,
} from "werift";
import {
  LIMITS,
  parseResult,
  bytes,
  FrameReceiver,
  ChunkAssembler,
  encodeFrames,
  decodeBase64,
  object,
  type AgentRequest,
  type AgentResult,
} from "@s2u/forge-agent-protocol";
import type { PagePeer } from "./sessions.js";
import { createHash } from "node:crypto";
/** One ICE server URL without credentials, a query or a path: `stun:`, `turn:` or `turns:`, a host name, an optional port. */
const ICE_URL = /^(?:stun|turns?):[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::(\d{1,5}))?$/;
/**
 * Browser adaptation (the gateway's deploy, GW-F-1): FORGE_AGENT_ICE_SERVERS, a comma-separated list of `stun:host:port`
 * (`turn:`/`turns:` taken for later) -- werift's `iceServers`, one `{ urls }` each. Credentials are not supported: a URL
 * with `@` or a query is refused. Unset or empty: none, as before.
 */
export function parseIceServers(value: string | undefined): RTCIceServer[] {
  if (value === undefined || value.trim() === "") return [];
  return value.split(",").map((entry) => {
    const url = entry.trim(),
      port = ICE_URL.exec(url)?.[1];
    if (!ICE_URL.test(url) || (port !== undefined && (Number(port) < 1 || Number(port) > 65535)))
      throw Error(
        `INVALID_ICE_SERVERS: FORGE_AGENT_ICE_SERVERS takes comma-separated stun:/turn:/turns: host[:port] URLs, without credentials or a query (got ${JSON.stringify(url)})`,
      );
    return { urls: url };
  });
}
/**
 * Browser adaptation (the gateway's deploy, GW-F-1): FORGE_AGENT_ICE_PORTS, `min-max`, the UDP ports the box's firewall
 * opens -- werift's `icePortRange` (1024 <= min < max <= 65535; werift refuses min == max). Unset or empty: none, as before.
 */
export function parseIcePortRange(value: string | undefined): [number, number] | undefined {
  if (value === undefined || value === "") return undefined;
  const m = /^(\d{1,5})-(\d{1,5})$/.exec(value),
    min = Number(m?.[1]),
    max = Number(m?.[2]);
  if (!m || min < 1024 || max > 65535 || min >= max)
    throw Error(
      `INVALID_ICE_PORTS: FORGE_AGENT_ICE_PORTS takes min-max, 1024 <= min < max <= 65535 (got ${JSON.stringify(value)})`,
    );
  return [min, max];
}
/** The gateway's peer configuration from its environment; both settings unset is exactly `{ iceServers: [] }`. */
export function rtcConfigFromEnv(env: Readonly<Record<string, string | undefined>>): RTCPeerConnectionConfig {
  const iceServers = parseIceServers(env.FORGE_AGENT_ICE_SERVERS),
    icePortRange = parseIcePortRange(env.FORGE_AGENT_ICE_PORTS);
  return icePortRange ? { iceServers, icePortRange } : { iceServers };
}
/** Data-only RTC; signaling never accepts application commands. ICE servers are operator-configured. */
export function createRtcPeer(
  signal: (candidate: unknown) => void,
  config: RTCPeerConnectionConfig = { iceServers: [] },
  onDisconnect: (reason: string) => void = () => {},
): PagePeer {
  const pc = new RTCPeerConnection(config),
    channel = pc.createDataChannel("s2u-agent-v1", {
      ordered: true,
      protocol: "s2u-agent-v1",
    });
  let closed = false,
    answerSet = false;
  let openResolve!: () => void, openReject!: (e: Error) => void;
  const opened = new Promise<void>((resolve, reject) => {
    openResolve = resolve;
    openReject = reject;
  });
  // A catch is attached immediately: disconnect may precede the first command.
  void opened.catch(() => {});
  const openTimer = setTimeout(() => {
    openReject(Error("CHANNEL_TIMEOUT"));
    transportLost("RTC_TIMEOUT");
  }, LIMITS.requestMs);
  const pending = new Map<
    string,
    {
      resolve: (r: AgentResult) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
      capture: boolean;
    }
  >();
  const frames = new FrameReceiver(),
    images = new ChunkAssembler();
  let image:
    | { requestId: string; transferId: string; mimeType: string; data?: Buffer }
    | undefined;
  // Browser adaptation: the last capture ended early (timeout or the page's own result) -- its late image frames are
  // dropped, not a protocol error. One slot each: the transfer, and a capture that timed out before its image.begin.
  let cancelledImage: string | undefined, cancelledCapture: string | undefined;
  const cancelImage = () => {
    if (image) cancelledImage = image.transferId;
    images.cancel();
    image = undefined;
  };
  const rejectAll = () => {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(Error("CHANNEL_CLOSED"));
    }
    pending.clear();
    frames.clear();
    images.cancel();
    image = undefined;
    cancelledImage = cancelledCapture = undefined;
  };
  pc.onIceCandidate.subscribe((candidate) => {
    if (candidate && !closed) signal(candidate.toJSON());
  });
  pc.connectionStateChange.subscribe((state) => {
    if (["closed", "failed", "disconnected"].includes(state))
      transportLost("RTC_DISCONNECTED");
  });
  channel.stateChanged.subscribe((state) => {
    if (state === "open") {
      clearTimeout(openTimer);
      openResolve();
    }
    if (state === "closed" || state === "closing") {
      clearTimeout(openTimer);
      openReject(Error("CHANNEL_CLOSED"));
      rejectAll();
      transportLost("RTC_DISCONNECTED");
    }
  });
  channel.onMessage.subscribe((raw) => {
    try {
      if (Buffer.byteLength(raw) > LIMITS.chunkBytes)
        throw Error("CONTROL_TOO_LARGE");
      const value = frames.push(raw.toString());
      if (value === undefined) return;
      const message = object(value);
      if (message.type === "image.begin") {
        if (
          typeof message.requestId === "string" &&
          message.requestId === cancelledCapture &&
          !pending.has(message.requestId)
        ) {
          // The late image of a capture that timed out before it began.
          if (typeof message.transferId === "string") cancelledImage = message.transferId;
          return;
        }
        if (
          image ||
          typeof message.requestId !== "string" ||
          !pending.get(message.requestId)?.capture ||
          typeof message.transferId !== "string" ||
          !["image/png", "image/jpeg"].includes(String(message.mimeType))
        )
          throw Error("INVALID_IMAGE");
        images.begin(message.transferId, Number(message.size));
        if (message.transferId !== cancelledImage) cancelledImage = undefined;
        image = {
          requestId: message.requestId,
          transferId: message.transferId,
          mimeType: String(message.mimeType),
        };
        return;
      }
      if (message.type === "image.chunk") {
        if (
          image?.transferId !== message.transferId &&
          message.transferId === cancelledImage
        )
          return;
        if (
          !image ||
          image.transferId !== message.transferId ||
          typeof message.data !== "string" ||
          !Number.isSafeInteger(message.index)
        )
          throw Error("INVALID_IMAGE");
        images.chunk(
          image.transferId,
          Number(message.index),
          decodeBase64(message.data),
        );
        return;
      }
      if (message.type === "image.finish") {
        if (
          image?.transferId !== message.transferId &&
          message.transferId === cancelledImage
        )
          return;
        if (
          !image ||
          image.transferId !== message.transferId ||
          typeof message.digest !== "string"
        )
          throw Error("INVALID_IMAGE");
        const data = Buffer.from(images.finish(image.transferId));
        if (createHash("sha256").update(data).digest("hex") !== message.digest)
          throw Error("IMAGE_DIGEST");
        image.data = data;
        return;
      }
      if (message.type !== "result") throw Error("INVALID_MESSAGE");
      let result = parseResult(message.result);
      const p = pending.get(result.requestId);
      if (!p) return;
      if (image?.requestId === result.requestId) {
        // Browser adaptation: a page that refuses or fails a capture after image.begin ends that request only, not the peer.
        const transfer = image;
        // An image not finished when the page's result arrives may still send its late frames.
        if (transfer.data) {
          images.cancel();
          image = undefined;
        } else cancelImage();
        const data =
          result.data && typeof result.data === "object" && !Array.isArray(result.data)
            ? (result.data as Record<string, unknown>)
            : undefined;
        if (result.outcome === "ok" || (data && "image" in data)) {
          const reference =
            data?.image && typeof data.image === "object" ? (data.image as Record<string, unknown>) : undefined;
          // A result claiming an image it did not complete refuses that one request.
          if (!transfer.data || reference?.transferId !== transfer.transferId || reference.mimeType !== transfer.mimeType)
            result = { requestId: result.requestId, revision: result.revision, outcome: "unknown", code: "INCOMPLETE_IMAGE" };
          else
            result.data = {
              ...data,
              image: { mimeType: transfer.mimeType, data: transfer.data.toString("base64") },
            };
        }
      } else if (
        result.data &&
        typeof result.data === "object" &&
        "image" in result.data
      )
        throw Error("UNSOLICITED_IMAGE");
      pending.delete(result.requestId);
      clearTimeout(p.timer);
      p.resolve(result);
    } catch {
      rejectAll();
      transportLost("RTC_PROTOCOL_ERROR");
    }
  });
  const close = async () => {
    if (closed) return;
    closed = true;
    clearTimeout(openTimer);
    openReject(Error("CHANNEL_CLOSED"));
    rejectAll();
    channel.close();
    await pc.close();
  };
  function transportLost(reason: string) {
    if (closed) return;
    onDisconnect(reason);
    void close().catch(() => {});
  }
  return {
    async offer() {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (closed) throw Error("CHANNEL_CLOSED");
      return pc.localDescription!.sdp;
    },
    async answer(sdp) {
      if (closed || answerSet) throw Error("ANSWER_REPLAY");
      answerSet = true;
      await pc.setRemoteDescription({ type: "answer", sdp });
    },
    async ice(candidate) {
      if (closed || !answerSet) throw Error("UNSOLICITED_ICE");
      await pc.addIceCandidate(candidate as RTCIceCandidateInit);
    },
    async request(request) {
      await opened;
      if (closed || channel.readyState !== "open")
        throw Error("CHANNEL_NOT_READY");
      if (pending.has(request.requestId)) throw Error("REQUEST_IN_FLIGHT");
      if (pending.size >= LIMITS.queuedCommands) throw Error("QUEUE_FULL");
      const message = { type: "request", request };
      if (bytes(message) > LIMITS.controlBytes)
        throw Error("CONTROL_TOO_LARGE");
      const maxMessage = pc.sctpTransport?.maxMessageSize;
      const outbound = encodeFrames(
        message,
        maxMessage && maxMessage > 0
          ? Math.min(LIMITS.chunkBytes, maxMessage)
          : LIMITS.chunkBytes,
      );
      const outboundBytes = outbound.reduce(
        (total, frame) => total + Buffer.byteLength(frame),
        0,
      );
      if (channel.bufferedAmount + outboundBytes > LIMITS.controlBytes * 2)
        throw Error("BACKPRESSURE");
      return new Promise<AgentResult>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(request.requestId);
          // The frame receiver is shared by every reply on the channel: a timeout leaves another request's frames intact.
          if (image?.requestId === request.requestId) cancelImage();
          else if (request.operation === "target.capture")
            cancelledCapture = request.requestId;
          resolve({
            requestId: request.requestId,
            revision: 0,
            outcome: "unknown",
            code: "REQUEST_TIMEOUT",
          });
        }, LIMITS.requestMs);
        pending.set(request.requestId, {
          resolve,
          reject,
          timer,
          capture: request.operation === "target.capture",
        });
        try {
          for (const frame of outbound) channel.send(frame);
        } catch (e) {
          clearTimeout(timer);
          pending.delete(request.requestId);
          reject(e);
        }
      });
    },
    close,
  };
}
