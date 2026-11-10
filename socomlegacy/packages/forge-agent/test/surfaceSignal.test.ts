import { it, expect, vi } from "vitest";
import { RTCPeerConnection } from "werift";
import WebSocket from "ws";
import { createGateway } from "../src/gateway.js";
import { createRtcPeer } from "../src/rtc.js";
import { freePort } from "./ports.js";
import { createAgentConnection } from "../../viewer/src/agent/connection";

/**
 * RC1's SURFACE_DENIED reds (088766214, shadow's GPU view only): the page entered Forge Play and said so, but the gateway
 * kept refusing Play operations on its cached forge-editor. The gateway handled the page's signals one at a time, so a
 * `surface` waited behind earlier answer/ICE steps still in the peer -- werift looks up each `.local` candidate by mDNS with
 * a 10 s timeout, one after another, so on a host whose multicast DNS gets no answer that is tens of seconds (LATER 847). A
 * surface change is a state update that depends on no SDP: it must land while ICE is still pending.
 * The real page connection and the real gateway (as `captureBoundary.test.ts`); the gateway's peer is the real one with
 * `ice` held unsettled, and one ICE signal is sent so the hold is certain on any host.
 */
it("a page's surface change reaches the gateway while an earlier ICE step is still pending", async () => {
  const port = await freePort();
  const held: Array<() => void> = [];
  const gateway = createGateway({
    issuer: `http://127.0.0.1:${port}`,
    origins: ["http://localhost:5361"],
    development: true,
    peerFactory: (signal, onDisconnect) => {
      const peer = createRtcPeer(signal, { iceServers: [] }, onDisconnect);
      return { ...peer, ice: () => new Promise<void>((resolve) => held.push(resolve)) };
    },
  });
  await gateway.listen(port);
  const sockets: WebSocket[] = [],
    peers: RTCPeerConnection[] = [];
  let surface: "forge-editor" | "forge-play" = "forge-editor";
  const connection = createAgentConnection({
    gateway: `http://127.0.0.1:${port}`,
    target: {
      read: () => ({ surface, revision: 0, name: "Synthetic Forge", build: "test" }),
      dispatch: async (r) => ({ requestId: r.requestId, revision: 0, outcome: "ok", data: { surface } }),
    },
    fetch: (url, init) => {
      const headers = new Headers(init?.headers);
      headers.set("Origin", "http://localhost:5361");
      return fetch(url, { ...init, headers });
    },
    socket: (url, protocols) => {
      const socket = new WebSocket(url, protocols, { origin: "http://localhost:5361" });
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
    const invitation = /\/join\/([A-Za-z0-9_.:-]+)$/.exec(instructions)![1]!;
    const pair = gateway.state.pair("surface-test", invitation, ["inspect", "test"], "Synthetic surface probe");
    await vi.waitFor(() => expect(connection.state().status).toBe("approval"));
    connection.approve(["inspect", "test"]);
    await vi.waitFor(() => expect(connection.state().status).toBe("connected"), { timeout: 5000 });
    // One trickle-ICE step the gateway's peer has not settled: the page's own may or may not exist on this host.
    sockets[0]!.send(JSON.stringify({ type: "ice", sessionId: pair.sessionId, targetId: pair.targetId, epoch: pair.epoch,
      candidate: { candidate: "candidate:1 1 udp 2122260223 192.0.2.10 50000 typ host", sdpMid: "0", sdpMLineIndex: 0 } }));
    await vi.waitFor(() => expect(held.length).toBeGreaterThan(0));
    surface = "forge-play";
    connection.refresh();
    // The status lists paired, pending and reloading entries; only a paired one carries `surface` and `notes`.
    const paired = () => {
      const s = gateway.state.status("surface-test").sessions[0];
      return s && "surface" in s && "notes" in s ? s : undefined;
    };
    await vi.waitFor(() => expect(paired()?.surface).toBe("forge-play"), { timeout: 3000 });
    const request = { version: 1, requestId: "play-op", sessionId: pair.sessionId, targetId: pair.targetId, epoch: pair.epoch,
      operation: "scenario.status", args: {} };
    expect(await gateway.state.command("surface-test", request)).toMatchObject({ outcome: "ok" });
    // AX-14's note is the same kind of signal (no SDP in it): it is not held behind the pending ICE step either.
    sockets[0]!.send(JSON.stringify({ type: "note", sessionId: pair.sessionId, targetId: pair.targetId, epoch: pair.epoch,
      noteId: "note-1", text: "Try the north door" }));
    await vi.waitFor(() => expect(paired()?.notes).toEqual([
      expect.objectContaining({ text: "Try the north door" })]), { timeout: 3000 });
  } finally {
    for (const resolve of held) resolve();
    connection.dispose();
    for (const socket of sockets) socket.terminate();
    await gateway.close();
    await Promise.all(peers.map((peer) => peer.close()));
  }
}, 30000);
