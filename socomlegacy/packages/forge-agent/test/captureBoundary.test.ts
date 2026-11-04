import { it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import { RTCPeerConnection } from "werift";
import WebSocket from "ws";
import { createGateway } from "../src/gateway.js";
import { freePort } from "./ports.js";
import { createAgentConnection } from "../../viewer/src/agent/connection";
import { LIMITS } from "@s2u/forge-agent-protocol";

/** Synthetic Blob, real page sender/WSS/RTC receiver. This does not exercise a browser's canvas encoder. */
it("captures exactly 2 MiB through the page sender and rejects an oversized Blob without losing the session", async () => {
  const port = await freePort();
  const gateway = createGateway({
    issuer: `http://127.0.0.1:${port}`,
    origins: ["http://localhost:5361"],
    development: true,
  });
  await gateway.listen(port);
  const sockets: WebSocket[] = [],
    peers: RTCPeerConnection[] = [];
  let captureBytes = LIMITS.transferBytes;
  const connection = createAgentConnection({
    gateway: `http://127.0.0.1:${port}`,
    target: {
      read: () => ({
        surface: "testroom-solo",
        revision: 0,
        name: "Synthetic capture",
        build: "test",
      }),
      dispatch: async (r) => ({
        requestId: r.requestId,
        revision: 0,
        outcome: "ok",
        data: { alive: true },
      }),
      capture: async () =>
        new Blob([new Uint8Array(captureBytes).fill(42)], {
          type: "image/png",
        }),
    },
    fetch: (url, init) => {
      const headers = new Headers(init?.headers);
      headers.set("Origin", "http://localhost:5361");
      return fetch(url, { ...init, headers });
    },
    socket: (url, protocols) => {
      const socket = new WebSocket(url, protocols, {
        origin: "http://localhost:5361",
      });
      sockets.push(socket);
      return socket as unknown as globalThis.WebSocket;
    },
    peer: () => {
      const peer = new RTCPeerConnection({ iceServers: [], iceUseIpv6: false });
      peers.push(peer);
      return peer as unknown as globalThis.RTCPeerConnection;
    },
  });
  try {
    const instructions = await connection.prepare("other");
    await vi.waitFor(() => expect(sockets[0]?.readyState).toBe(WebSocket.OPEN));
    const invitation = JSON.parse(
      /agent_pair with invitation ("[^"]+")/.exec(instructions)![1]!,
    );
    const pair = gateway.state.pair(
      "capture-test",
      invitation,
      ["inspect", "capture"],
      "Synthetic capture probe",
    );
    await vi.waitFor(() => expect(connection.state().status).toBe("approval"));
    connection.approve(["inspect", "capture"]);
    await vi.waitFor(
      () => expect(connection.state().status).toBe("connected"),
      { timeout: 5000 },
    );
    const request = {
      version: 1,
      requestId: "boundary",
      sessionId: pair.sessionId,
      targetId: pair.targetId,
      epoch: pair.epoch,
      operation: "target.capture",
      args: {},
    };
    const started = performance.now(),
      result = await gateway.state.command("capture-test", request);
    expect(result.outcome).toBe("ok");
    const image = (result.data as { image: { data: string; mimeType: string } })
      .image;
    const data = Buffer.from(image.data, "base64");
    expect(data.length).toBe(LIMITS.transferBytes);
    expect(createHash("sha256").update(data).digest("hex")).toBe(
      createHash("sha256")
        .update(new Uint8Array(LIMITS.transferBytes).fill(42))
        .digest("hex"),
    );
    console.info(
      "CAPTURE_BOUNDARY_PROBE",
      JSON.stringify({
        bytes: data.length,
        wallMs: Math.round(performance.now() - started),
      }),
    );
    captureBytes++;
    const refused = await gateway.state.command("capture-test", {
      ...request,
      requestId: "oversized",
    });
    expect(refused).toMatchObject({
      outcome: "refused",
      code: "CAPTURE_TOO_LARGE",
    });
    expect(
      await gateway.state.command("capture-test", {
        ...request,
        requestId: "alive",
        operation: "target.status",
      }),
    ).toMatchObject({ outcome: "ok", data: { alive: true } });
    expect(gateway.state.status("capture-test").sessions).toHaveLength(1);
  } finally {
    connection.dispose();
    for (const socket of sockets) socket.terminate();
    await gateway.close();
    await Promise.all(peers.map((peer) => peer.close()));
  }
}, 30000);
