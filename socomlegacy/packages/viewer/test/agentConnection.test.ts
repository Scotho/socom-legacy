import { describe, expect, it, vi } from "vitest";
import {
  createAgentConnection,
  connectionInstructions,
  ROUTE_OPEN_MS,
} from "../src/agent/connection";
import { pairingInvitation } from "../src/agent/setup";
import {
  CaptureRefusal,
  encodeFrames,
  FrameReceiver,
  LIMITS,
  type AgentRequest,
  type AgentResult,
  type Surface,
  type Permission,
} from "@s2u/forge-agent-protocol";
import { createGateway } from "../../forge-agent/src/gateway";
import { freePort } from "../../forge-agent/test/ports";
import {
  connectionNotes,
  createAgentActivity,
  observeTarget,
  type AgentActivityStore,
} from "../src/agent/activity";
import { AGENT_CODE_WORDS } from "../src/agent/codes";
import { RTCPeerConnection as WeriftPeer } from "werift";
import NodeSocket from "ws";

class Channel extends EventTarget {
  label = "s2u-agent-v1";
  protocol = "s2u-agent-v1";
  ordered = true;
  maxRetransmits = null;
  maxPacketLifeTime = null;
  readyState = "connecting";
  bufferedAmount = 0;
  sent: string[] = [];
  send(text: string) {
    this.sent.push(text);
  }
  close() {
    this.readyState = "closed";
    this.dispatchEvent(new Event("close"));
  }
  open() {
    this.readyState = "open";
    this.dispatchEvent(new Event("open"));
  }
  message(value: unknown) {
    for (const text of encodeFrames(value))
      this.dispatchEvent(new MessageEvent("message", { data: text }));
  }
  results() {
    const r = new FrameReceiver();
    return this.sent.flatMap((text) => {
      const m = r.push(text) as { result?: AgentResult } | undefined;
      return m?.result ? [m.result] : [];
    });
  }
}
class Peer extends EventTarget {
  remoteDescription: RTCSessionDescriptionInit | null = null;
  localDescription: RTCSessionDescriptionInit | null = null;
  closed = false;
  ice: unknown[] = [];
  setRemoteDescription = vi.fn(
    async (description: RTCSessionDescriptionInit) => {
      this.remoteDescription = description;
    },
  );
  createAnswer = vi.fn(async () => ({
    type: "answer" as const,
    sdp: "answer",
  }));
  setLocalDescription = vi.fn(
    async (description: RTCSessionDescriptionInit) => {
      this.localDescription = description;
    },
  );
  addIceCandidate = vi.fn(async (candidate: unknown) => {
    if (!this.remoteDescription) throw Error("EARLY_ICE");
    this.ice.push(candidate);
  });
  close() {
    this.closed = true;
  }
  channel(channel: Channel) {
    this.dispatchEvent(Object.assign(new Event("datachannel"), { channel }));
  }
}
const registration = () => ({
  targetId: "target1",
  pageToken: "placeholder",
  epoch: "epoch1",
  invitation: "invitation1",
  expiresAt: Date.now() + 300000,
});
function pairedRig(
  config: {
    dispatch?: (r: AgentRequest, signal: AbortSignal) => Promise<AgentResult>;
    document?: Document;
    createPeer?: (index: number) => Peer;
    revoke?: () => void;
    /** AX-8 (AX.R4): the target's pause hook, called when the tab becomes hidden. */
    pause?: (reason: string) => void;
    now?: () => number;
    capture?: (request?: AgentRequest) => Promise<Blob>;
    permissions?: Permission[];
    /** R3-A (5): the target observed into a store, and the connection's lines bridged into it, as `install.ts` wires them. */
    activity?: AgentActivityStore;
  } = {},
) {
  const sockets: Socket[] = [],
    peers: Peer[] = [];
  let surface: Surface | "blocked" = "forge-editor",
    revision = 0;
  const dispatch = vi.fn(
    config.dispatch ??
      (async (r: AgentRequest) => ({
        requestId: r.requestId,
        revision: ++revision,
        outcome: "ok" as const,
      })),
  );
  const revoke = vi.fn(config.revoke);
  const pause = vi.fn(config.pause);
  const base = {
    read: () => ({ surface, revision, name: "Map", build: "test" }),
    dispatch,
    revoke,
    pause,
    capture: config.capture,
  };
  const connection = createAgentConnection({
    gateway: "http://127.0.0.1:5360",
    target: config.activity ? observeTarget(base, config.activity) : base,
    document: config.document,
    now: config.now,
    fetch: vi.fn(
      async () => new Response(JSON.stringify(registration()), { status: 201 }),
    ),
    socket: () => {
      const s = new Socket();
      sockets.push(s);
      return s as unknown as WebSocket;
    },
    peer: () => {
      const p = config.createPeer?.(peers.length) ?? new Peer();
      peers.push(p);
      return p as unknown as RTCPeerConnection;
    },
  });
  if (config.activity) {
    const ingest = connectionNotes(config.activity);
    connection.subscribe((state) => ingest(state.activity));
  }
  async function pair() {
    const permissions: Permission[] = config.permissions ?? ["inspect", "edit"];
    await connection.prepare("codex");
    const socket = sockets.at(-1)!;
    socket.message({
      type: "pending",
      pendingId: "p",
      clientName: "agent",
      comparisonCode: "123456",
      permissions,
    });
    connection.approve(permissions);
    socket.message({
      type: "offer",
      sessionId: "s",
      targetId: "target1",
      epoch: "epoch1",
      permissions,
      sdp: "offer",
    });
    await vi.waitFor(() =>
      expect(socket.sent.some((s) => JSON.parse(s).type === "answer")).toBe(
        true,
      ),
    );
    const peer = peers.at(-1)!,
      channel = new Channel();
    peer.channel(channel);
    channel.open();
    return { socket, peer, channel };
  }
  const request = (id = "r"): AgentRequest => ({
    version: 1,
    requestId: id,
    sessionId: "s",
    targetId: "target1",
    epoch: "epoch1",
    expectedRevision: 0,
    operation: "forge.edit",
    args: {},
  });
  return {
    connection,
    sockets,
    peers,
    dispatch,
    revoke,
    pause,
    pair,
    request,
    setSurface: (value: Surface | "blocked") => (surface = value),
    setRevision: (value: number) => (revision = value),
  };
}

class Socket extends EventTarget {
  readyState = 1;
  sent: string[] = [];
  send(data: string) {
    this.sent.push(data);
  }
  close() {
    this.readyState = 3;
  }
  message(data: unknown) {
    this.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(data) }),
    );
  }
}
function rig() {
  const socket = new Socket();
  const dispatch = vi.fn(async () => ({
    requestId: "request1",
    revision: 1,
    outcome: "ok" as const,
  }));
  const fetch = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          targetId: "target1",
          pageToken: "placeholder",
          epoch: "epoch1",
          invitation: "invitation1",
          expiresAt: Date.now() + 300000,
        }),
        { status: 201 },
      ),
  );
  const sockets: { url: string; protocols: string[] }[] = [];
  const connection = createAgentConnection({
    gateway: "http://127.0.0.1:5360",
    target: {
      read: () => ({
        surface: "forge-editor" as const,
        revision: 0,
        name: "Blank floor",
        build: "test",
        map: "blank",
      }),
      dispatch,
    },
    fetch,
    socket: (url, protocols) => {
      sockets.push({ url, protocols });
      return socket as unknown as WebSocket;
    },
  });
  return { socket, fetch, dispatch, sockets, connection };
}

describe("agent page connection", () => {
  it("bounds a stuck dispatcher and refuses queued work after its deadline", async () => {
    vi.useFakeTimers();
    let scope: AbortSignal | undefined;
    const r = pairedRig({
      dispatch: async (_request, signal) => {
        scope = signal;
        return new Promise(() => {});
      },
    });
    try {
      const { channel } = await r.pair();
      channel.message({ type: "request", request: r.request("stuck") });
      await vi.advanceTimersByTimeAsync(0);
      channel.message({ type: "request", request: r.request("late") });
      await vi.advanceTimersByTimeAsync(30001);
      expect(channel.results()).toContainEqual(
        expect.objectContaining({
          requestId: "stuck",
          outcome: "unknown",
          code: "REQUEST_TIMEOUT",
        }),
      );
      expect(channel.results()).toContainEqual(
        expect.objectContaining({
          requestId: "late",
          outcome: "refused",
          code: "QUEUE_TIMEOUT",
        }),
      );
      expect(scope?.aborted).toBe(true);
      expect(r.dispatch).toHaveBeenCalledTimes(1);
    } finally {
      r.connection.dispose();
      vi.useRealTimers();
    }
  });
  it("round-trips real gateway signaling and RTC through the page connection with receipt retries", async () => {
    const port = await freePort();
    const gateway = createGateway({
      issuer: `http://127.0.0.1:${port}`,
      origins: ["http://localhost:5361"],
      development: true,
    });
    await gateway.listen(port);
    const sockets: NodeSocket[] = [],
      peers: WeriftPeer[] = [];
    let revision = 0;
    const receipts = new Map<string, AgentResult>();
    const dispatch = vi.fn(async (request: AgentRequest) => {
      const prior = receipts.get(request.requestId);
      if (prior) return prior;
      if (request.expectedRevision !== revision)
        return {
          requestId: request.requestId,
          revision,
          outcome: "refused" as const,
          code: "REVISION_CONFLICT",
        };
      const result = {
        requestId: request.requestId,
        revision: ++revision,
        outcome: "ok" as const,
      };
      receipts.set(request.requestId, result);
      return result;
    });
    const connection = createAgentConnection({
      gateway: `http://127.0.0.1:${port}`,
      target: {
        read: () => ({
          surface: "forge-editor",
          revision,
          name: "Real RTC",
          build: "test",
        }),
        dispatch,
      },
      fetch: (url, init) => {
        const headers = new Headers(init?.headers);
        headers.set("Origin", "http://localhost:5361");
        return fetch(url, { ...init, headers });
      },
      socket: (url, protocols) => {
        const socket = new NodeSocket(url, protocols, {
          origin: "http://localhost:5361",
        });
        sockets.push(socket);
        return socket as unknown as WebSocket;
      },
      peer: () => {
        const peer = new WeriftPeer({ iceServers: [], iceUseIpv6: false });
        peers.push(peer);
        return peer as unknown as RTCPeerConnection;
      },
    });
    try {
      const text = await connection.prepare("codex");
      await vi.waitFor(() =>
        expect(sockets[0]?.readyState).toBe(NodeSocket.OPEN),
      );
      // AX-U (C6): the copied line's join link carries the invitation.
      const invitation = pairingInvitation(text)!;
      expect(text).toMatch(/^Connect to my SOCOM 2 Legacy page: http:\/\/127\.0\.0\.1:\d+\/join\/[A-Za-z0-9_.:-]+$/);
      const pair = gateway.state.pair(
        "native-page",
        invitation,
        ["edit"],
        "Integration agent",
      );
      await vi.waitFor(() =>
        expect(connection.state().status).toBe("approval"),
      );
      connection.approve(["edit"]);
      await vi.waitFor(
        () => expect(connection.state().status).toBe("connected"),
        { timeout: 10000 },
      );
      const request = {
        version: 1,
        requestId: "real-edit",
        sessionId: pair.sessionId,
        targetId: pair.targetId,
        epoch: pair.epoch,
        expectedRevision: 0,
        operation: "forge.edit",
        args: {},
      };
      expect(await gateway.state.command("native-page", request)).toMatchObject(
        { outcome: "ok", revision: 1 },
      );
      expect(await gateway.state.command("native-page", request)).toMatchObject(
        { outcome: "ok", revision: 1 },
      );
      expect(revision).toBe(1);
      expect(dispatch).toHaveBeenCalledTimes(2);
      connection.disconnect();
      await vi.waitFor(() =>
        expect(gateway.state.status("native-page").sessions).toEqual([]),
      );
      expect(
        (await gateway.state.command("native-page", request)).outcome,
      ).toBe("refused");
      expect(dispatch).toHaveBeenCalledTimes(2);
    } finally {
      connection.dispose();
      for (const socket of sockets) socket.terminate();
      await gateway.close();
      await Promise.all(peers.map((peer) => peer.close()));
    }
  }, 30000);
  it("keeps a per-frame refresh alive during negotiation, then enforces real session expiry", async () => {
    let finish!: () => void;
    const remote = new Promise<void>((resolve) => { finish = resolve; });
    let clock = Date.now();
    const r = pairedRig({ now: () => clock, createPeer: () => {
      const peer = new Peer();
      peer.setRemoteDescription.mockImplementation(async description => {
        await remote;
        peer.remoteDescription = description;
      });
      return peer;
    } });
    r.setSurface("testroom-solo");
    const pairing = r.pair();
    try {
      await vi.waitFor(() => expect(r.peers).toHaveLength(1));
      r.connection.refresh();
      expect(r.connection.state().status).toBe("connecting");
      expect(r.peers[0]!.closed).toBe(false);
      expect(r.revoke).not.toHaveBeenCalled();
      finish();
      await pairing;
      expect(r.connection.state().status).toBe("connected");
      clock += LIMITS.sessionIdleMs;
      r.connection.refresh();
      expect(r.connection.state().status).toBe("disconnected");
      expect(r.revoke).toHaveBeenCalledOnce();
    } finally {
      finish();
      await pairing.catch(() => {});
      r.connection.dispose();
    }
  });
  it.each(["CAPTURE_TIMEOUT", "CAPTURE_UNAVAILABLE", "private encoder detail"])(
    "reports a pre-transfer capture failure without implying an unknown edit or losing the session: %s", async message => {
      const r = pairedRig({ permissions: ["inspect", "edit", "capture"], capture: async () => { throw Error(message); } });
      try {
        const { channel } = await r.pair();
        channel.message({ type: "request", request: { ...r.request("failed-capture"), operation: "target.capture" } });
        await vi.waitFor(() => expect(channel.results()).toHaveLength(1));
        const code = message.startsWith("CAPTURE_") ? message : "CAPTURE_FAILED";
        expect(channel.results()[0]).toMatchObject({ outcome: "refused", code });
        expect(JSON.stringify(channel.results()[0])).not.toContain("private encoder detail");
        expect(r.connection.state().status).toBe("connected");
        channel.message({ type: "request", request: r.request("after-capture") });
        await vi.waitFor(() => expect(channel.results()).toHaveLength(2));
        expect(channel.results()[1]).toMatchObject({ outcome: "ok" });
      } finally { r.connection.dispose(); }
    },
  );
  it("AX-16: hands the capture its request and returns a target's capture refusal with its hint", async () => {
    const seen: unknown[] = [];
    const r = pairedRig({ permissions: ["inspect", "edit", "capture"], capture: async (request) => {
      seen.push(request?.args);
      throw new CaptureRefusal("UNSUPPORTED", "In the test room take view current or named.");
    } });
    try {
      const { channel } = await r.pair();
      channel.message({ type: "request", request: { ...r.request("preset"), operation: "target.capture", args: { view: "top" } } });
      await vi.waitFor(() => expect(channel.results()).toHaveLength(1));
      expect(seen).toEqual([{ view: "top" }]);
      expect(channel.results()[0]).toMatchObject({ outcome: "refused", code: "UNSUPPORTED", hint: "In the test room take view current or named." });
      expect(r.connection.state().status).toBe("connected");
    } finally { r.connection.dispose(); }
  });
  it("cannot recurse if revocation synchronously refreshes a blocked target", async () => {
    let refresh = () => {};
    const r = pairedRig({ revoke: () => refresh() });
    refresh = () => r.connection.refresh();
    try {
      const preparing = r.connection.prepare("codex").catch(() => {});
      r.setSurface("blocked");
      expect(() => r.connection.refresh()).not.toThrow();
      await preparing;
      expect(r.revoke).toHaveBeenCalledTimes(1);
    } finally {
      r.connection.dispose();
    }
  });
  it("ignores stale registration failures after another prepare replaces them", async () => {
    let first!: (value: Response) => void,
      calls = 0;
    const socket = new Socket();
    const pending = new Promise<Response>((resolve) => (first = resolve));
    const connection = createAgentConnection({
      gateway: "http://127.0.0.1:5360",
      target: {
        read: () => ({
          surface: "forge-editor",
          revision: 0,
          name: "Forge",
          build: "test",
        }),
        dispatch: vi.fn(),
      },
      fetch: vi.fn(() =>
        ++calls === 1
          ? pending
          : Promise.resolve(
              new Response(JSON.stringify(registration()), { status: 201 }),
            ),
      ),
      socket: () => socket as unknown as WebSocket,
    });
    try {
      const old = connection.prepare("codex").catch((e) => e as Error);
      await connection.prepare("codex");
      first(new Response("", { status: 503 }));
      expect(await old).toBeInstanceOf(Error);
      expect(connection.state().status).toBe("waiting");
    } finally {
      connection.dispose();
    }
  });
  it("does not let a stale asynchronous offer affect the replacement session", async () => {
    let release!: () => void;
    const delayed = new Peer();
    delayed.setRemoteDescription.mockImplementation(async (description) => {
      await new Promise<void>((resolve) => (release = resolve));
      delayed.remoteDescription = description;
    });
    const r = pairedRig({
      createPeer: (index) => (index === 0 ? delayed : new Peer()),
    });
    try {
      await r.connection.prepare("codex");
      const socket = r.sockets[0]!;
      socket.message({
        type: "pending",
        pendingId: "p",
        clientName: "agent",
        comparisonCode: "123456",
        permissions: ["inspect"],
      });
      r.connection.approve(["inspect"]);
      socket.message({
        type: "offer",
        sessionId: "s",
        targetId: "target1",
        epoch: "epoch1",
        permissions: ["inspect"],
        sdp: "offer",
      });
      r.connection.disconnect();
      await r.pair();
      release();
      await Promise.resolve();
      await Promise.resolve();
      expect(delayed.createAnswer).not.toHaveBeenCalled();
      expect(r.connection.state().status).toBe("connected");
    } finally {
      r.connection.dispose();
    }
  });
  it("ignores unapproved, malformed or escalated offers", async () => {
    const r = pairedRig();
    try {
      await r.connection.prepare("codex");
      const socket = r.sockets[0]!,
        offer = {
          type: "offer",
          sessionId: "s",
          targetId: "target1",
          epoch: "epoch1",
          permissions: ["inspect"],
          sdp: "offer",
        };
      socket.message(offer);
      expect(r.peers).toHaveLength(0);
      socket.message({
        type: "pending",
        pendingId: "p",
        clientName: "agent",
        comparisonCode: "123456",
        permissions: ["inspect"],
      });
      r.connection.approve(["inspect"]);
      for (const permissions of [[], ["edit"], ["inspect", "inspect"]])
        socket.message({ ...offer, permissions });
      socket.message({ ...offer, targetId: "other" });
      socket.message({ ...offer, sdp: null });
      expect(r.peers).toHaveLength(0);
      socket.message(offer);
      await vi.waitFor(() => expect(r.peers).toHaveLength(1));
    } finally {
      r.connection.dispose();
    }
  });
  it("R3-A (5): a refusal made before the target (a permission) reaches the dock's store as one typed error row", async () => {
    const activity = createAgentActivity();
    const r = pairedRig({ permissions: ["inspect"], activity });
    try {
      const { channel } = await r.pair();
      channel.message({ type: "request", request: r.request() });
      await vi.waitFor(() => expect(channel.results()).toHaveLength(1));
      const sent = channel.results()[0]!;
      expect(sent).toMatchObject({ outcome: "refused", code: "PERMISSION_DENIED" });
      expect(r.dispatch).not.toHaveBeenCalled();
      await vi.waitFor(() =>
        expect(activity.entries().filter((e) => e.kind === "error")).toHaveLength(1),
      );
      const row = activity.entries().find((e) => e.kind === "error")!;
      expect(row).toMatchObject({ kind: "error", operation: "forge.edit", code: "PERMISSION_DENIED" });
      expect(row.text).toContain(AGENT_CODE_WORDS["PERMISSION_DENIED"]);
      // A request the target answers is its typed row once, never a second from the connection's line.
      const a2 = createAgentActivity();
      const r2 = pairedRig({ activity: a2 });
      try {
        const { channel: c2 } = await r2.pair();
        c2.message({ type: "request", request: r2.request("ok1") });
        await vi.waitFor(() => expect(c2.results()).toHaveLength(1));
        await vi.waitFor(() => expect(r2.connection.state().activity.some((a) => /complete$/.test(a.text))).toBe(true));
        expect(a2.entries().filter((e) => e.operation === "forge.edit")).toEqual([
          expect.objectContaining({ kind: "success", count: 1 }),
        ]);
      } finally {
        r2.connection.dispose();
      }
    } finally {
      r.connection.dispose();
    }
  });
  it("lets the page receipt dispatcher handle a retry before revision comparison", async () => {
    const r = pairedRig();
    try {
      const { channel } = await r.pair();
      r.setRevision(5);
      channel.message({ type: "request", request: r.request() });
      await vi.waitFor(() => expect(r.dispatch).toHaveBeenCalledTimes(1));
    } finally {
      r.connection.dispose();
    }
  });
  it("refreshes same-family surfaces and revokes a blocked page immediately", async () => {
    const r = pairedRig();
    try {
      const { socket, peer } = await r.pair();
      r.setSurface("forge-play");
      r.connection.refresh();
      expect(socket.sent.map((s) => JSON.parse(s))).toContainEqual({
        type: "surface",
        surface: "forge-play",
      });
      r.setSurface("blocked");
      r.connection.refresh();
      expect(peer.closed).toBe(true);
      expect(r.connection.state().status).toBe("disconnected");
    } finally {
      r.connection.dispose();
    }
  });
  it("buffers remote ICE until the approved offer has a remote description", async () => {
    const r = pairedRig();
    try {
      await r.connection.prepare("codex");
      const socket = r.sockets[0]!;
      socket.message({
        type: "pending",
        pendingId: "p",
        clientName: "agent",
        comparisonCode: "123456",
        permissions: ["inspect"],
      });
      r.connection.approve(["inspect"]);
      socket.message({
        type: "ice",
        sessionId: "s",
        targetId: "target1",
        epoch: "epoch1",
        candidate: { candidate: "early" },
      });
      socket.message({
        type: "offer",
        sessionId: "s",
        targetId: "target1",
        epoch: "epoch1",
        permissions: ["inspect"],
        sdp: "offer",
      });
      await vi.waitFor(() => expect(r.peers[0]?.ice).toHaveLength(1));
    } finally {
      r.connection.dispose();
    }
  });
  it("AX-8 (AX.R4): a hidden tab keeps the pairing, pauses the target once and refuses test work PAGE_HIDDEN", async () => {
    const doc = Object.assign(new EventTarget(), {
      visibilityState: "visible",
      defaultView: new EventTarget(),
    });
    const hide = (state: "hidden" | "visible") => {
      doc.visibilityState = state;
      doc.dispatchEvent(new Event("visibilitychange"));
    };
    const r = pairedRig({
      document: doc as unknown as Document,
      permissions: ["inspect", "edit", "test"],
    });
    try {
      const { channel, socket, peer } = await r.pair();
      r.setSurface("forge-play");
      r.connection.refresh();
      hide("hidden");
      // The pairing stays: no revoke to the service, the channel and the peer open, the target not revoked.
      expect(socket.sent.map((s) => JSON.parse(s).type)).not.toContain("revoke");
      expect(socket.readyState).toBe(1);
      expect(peer.closed).toBe(false);
      expect(r.revoke).not.toHaveBeenCalled();
      expect(r.connection.state().status).toBe("connected");
      expect(r.connection.state().hidden).toBe(true);
      expect(r.pause).toHaveBeenCalledTimes(1);
      expect(r.pause).toHaveBeenCalledWith("PAGE_HIDDEN");
      // A second hidden notice (and a per-frame refresh) while still hidden is the same hide: pause is not called again.
      hide("hidden");
      r.connection.refresh();
      expect(r.pause).toHaveBeenCalledTimes(1);
      // A test-permission request is refused PAGE_HIDDEN before the target; an inspect read goes through.
      const play = { ...r.request("t1"), operation: "forge.input", args: { operation: "input.set", arguments: {} } };
      channel.message({ type: "request", request: play });
      await vi.waitFor(() => expect(channel.results()).toHaveLength(1));
      expect(channel.results()[0]).toMatchObject({ requestId: "t1", outcome: "refused", code: "PAGE_HIDDEN" });
      expect(r.dispatch).not.toHaveBeenCalled();
      const read = { ...r.request("i1"), operation: "target.status", args: {} };
      delete (read as { expectedRevision?: number }).expectedRevision;
      channel.message({ type: "request", request: read });
      await vi.waitFor(() => expect(channel.results()).toHaveLength(2));
      expect(channel.results()[1]).toMatchObject({ requestId: "i1", outcome: "ok" });
      expect(r.dispatch).toHaveBeenCalledTimes(1);
      // Visible again: tests are accepted as before, nothing resumed by itself.
      hide("visible");
      expect(r.connection.state().hidden).toBe(false);
      channel.message({ type: "request", request: { ...play, requestId: "t2" } });
      await vi.waitFor(() => expect(channel.results()).toHaveLength(3));
      expect(channel.results()[2]).toMatchObject({ requestId: "t2", outcome: "ok" });
      expect(r.dispatch).toHaveBeenCalledTimes(2);
      // Each hide is one pause.
      hide("hidden");
      expect(r.pause).toHaveBeenCalledTimes(2);
    } finally {
      r.connection.dispose();
    }
  });
  it("AX-8: while hidden, an edit goes through and a camera.shot is refused PAGE_HIDDEN; the stop lane is never refused", async () => {
    const doc = Object.assign(new EventTarget(), {
      visibilityState: "visible",
      defaultView: new EventTarget(),
    });
    const r = pairedRig({ document: doc as unknown as Document, permissions: ["inspect", "edit", "test"] });
    try {
      const { channel } = await r.pair();
      doc.visibilityState = "hidden";
      doc.dispatchEvent(new Event("visibilitychange"));
      channel.message({ type: "request", request: r.request("e1") });
      await vi.waitFor(() => expect(channel.results()).toHaveLength(1));
      expect(channel.results()[0]).toMatchObject({ requestId: "e1", outcome: "ok" });
      const shot = { ...r.request("c1"), operation: "camera.shot", args: { points: [], seconds: 1 } };
      channel.message({ type: "request", request: shot });
      await vi.waitFor(() => expect(channel.results()).toHaveLength(2));
      expect(channel.results()[1]).toMatchObject({ requestId: "c1", outcome: "refused", code: "PAGE_HIDDEN" });
      const stop = { ...r.request("c2"), operation: "camera.stop", args: {} };
      delete (stop as { expectedRevision?: number }).expectedRevision;
      channel.message({ type: "request", request: stop });
      await vi.waitFor(() => expect(channel.results()).toHaveLength(3));
      expect(channel.results()[2]).toMatchObject({ requestId: "c2", outcome: "ok" });
    } finally {
      r.connection.dispose();
    }
  });
  it("AX-8: a tab hidden mid-pairing still finishes pairing, and pagehide still ends the pairing", async () => {
    const doc = Object.assign(new EventTarget(), {
      visibilityState: "visible",
      defaultView: new EventTarget(),
    });
    const r = pairedRig({ document: doc as unknown as Document });
    try {
      await r.connection.prepare("codex");
      const socket = r.sockets[0]!;
      socket.message({ type: "pending", pendingId: "p", clientName: "agent", comparisonCode: "123456", permissions: ["inspect"] });
      r.connection.approve(["inspect"]);
      // The player approves, then brings the terminal over the browser before the offer arrives.
      doc.visibilityState = "hidden";
      doc.dispatchEvent(new Event("visibilitychange"));
      expect(r.connection.state().status).toBe("connecting");
      socket.message({ type: "offer", sessionId: "s", targetId: "target1", epoch: "epoch1", permissions: ["inspect"], sdp: "offer" });
      await vi.waitFor(() => expect(socket.sent.some((s) => JSON.parse(s).type === "answer")).toBe(true));
      const channel = new Channel();
      r.peers[0]!.channel(channel);
      channel.open();
      await vi.waitFor(() => expect(r.connection.state().status).toBe("connected"));
      expect(r.connection.state().hidden).toBe(true);
      doc.defaultView.dispatchEvent(new Event("pagehide"));
      expect(socket.readyState).toBe(3);
      expect(r.peers[0]!.closed).toBe(true);
      expect(r.revoke).toHaveBeenCalledWith("PAGE_CLOSED");
      expect(r.connection.state().status).toBe("disconnected");
    } finally {
      r.connection.dispose();
    }
  });
  it("new pairing does not wait behind an old dispatcher that ignores cancellation", async () => {
    let calls = 0;
    const r = pairedRig({
      dispatch: async (request) => {
        calls++;
        if (calls === 1) await new Promise(() => {});
        return { requestId: request.requestId, revision: 1, outcome: "ok" };
      },
    });
    try {
      const first = await r.pair();
      first.channel.message({ type: "request", request: r.request("one") });
      await vi.waitFor(() => expect(calls).toBe(1));
      r.connection.disconnect();
      const second = await r.pair();
      second.channel.message({ type: "request", request: r.request("two") });
      await vi.waitFor(() => expect(calls).toBe(2));
    } finally {
      r.connection.dispose();
    }
  });
  it("uses credential-free public setup URLs and puts the page credential only in the signal protocol header", async () => {
    const r = rig();
    const text = await r.connection.prepare("codex");
    // AX-U (C6): the copied text is one line, the gateway's join link; the commands are the first-time disclosure's.
    expect(text).toBe("Connect to my SOCOM 2 Legacy page: http://127.0.0.1:5360/join/invitation1");
    expect(text).not.toContain("codex mcp add");
    expect(text).not.toContain("placeholder");
    expect(r.sockets[0]!.url).toBe("ws://127.0.0.1:5360/signal");
    expect(r.sockets[0]!.protocols).toEqual([
      "s2u-agent-v1",
      "auth.placeholder",
    ]);
    r.connection.disconnect();
  });
  it("cannot approve permissions the pending requester did not ask for", async () => {
    const r = rig();
    await r.connection.prepare("claude");
    r.socket.message({
      type: "pending",
      pendingId: "pending1",
      clientName: "Claude",
      comparisonCode: "123456",
      permissions: ["inspect"],
    });
    r.connection.approve(["inspect", "edit"]);
    const sent = r.socket.sent.map((s) => JSON.parse(s));
    expect(sent).toContainEqual({
      type: "approve",
      pendingId: "pending1",
      permissions: ["inspect"],
    });
    expect(r.dispatch).not.toHaveBeenCalled();
    r.connection.disconnect();
  });
  it("rejects public cleartext and URL credentials before any network request", async () => {
    expect(() =>
      createAgentConnection({
        gateway: "http://example.com",
        target: {
          read: () => ({
            surface: "forge-editor",
            revision: 0,
            name: "Map",
            build: "test",
          }),
          dispatch: vi.fn(),
        },
      }),
    ).toThrow("HTTPS");
    expect(() =>
      connectionInstructions(
        "codex",
        "https://user:password@example.com/mcp",
        "invite",
      ),
    ).toThrow();
  });
  it("disconnect revokes the page session and permits fresh pairing without reusing its secret", async () => {
    const r = rig();
    await r.connection.prepare("codex");
    r.connection.disconnect();
    expect(r.connection.state().status).toBe("disconnected");
    expect(r.socket.readyState).toBe(3);
    expect(r.connection.state().pending).toBeUndefined();
    await r.connection.prepare("codex");
    expect(r.fetch).toHaveBeenCalledTimes(2);
    r.connection.disconnect();
  });
  it("LATER 444: a Copy after the invitation's expiry keeps a live paired connection", async () => {
    let clock = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => clock);   // the registration's expiresAt on the same clock
    const r = pairedRig({ now: () => clock });
    try {
      const { socket, peer, channel } = await r.pair();
      await vi.waitFor(() => expect(r.connection.state().status).toBe("connected"));
      clock += LIMITS.invitationMs + 1;                // past the registration's expiresAt, inside the session's limits
      expect(LIMITS.invitationMs + 1).toBeLessThan(Math.min(LIMITS.sessionIdleMs, LIMITS.sessionAbsoluteMs));
      const text = await r.connection.prepare("codex");
      expect(text).toMatch(/^Connect to my SOCOM 2 Legacy page: http:\/\/127\.0\.0\.1:5360\/join\//);
      expect(r.connection.state().status).toBe("connected");
      expect(r.sockets).toHaveLength(1);              // no replacement registration
      expect(socket.readyState).toBe(1);
      expect(peer.closed).toBe(false);
      expect(channel.readyState).toBe("open");
      expect(r.revoke).not.toHaveBeenCalled();
      channel.message({ type: "request", request: r.request("after-copy") });
      await vi.waitFor(() => expect(channel.results()).toHaveLength(1));
      expect(channel.results()[0]).toMatchObject({ outcome: "ok" });
    } finally { r.connection.dispose(); vi.restoreAllMocks(); }
  });
  it("LATER 444: an expired invitation with no paired session is still replaced on the next Copy", async () => {
    let clock = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => clock);   // the registration's expiresAt on the same clock
    const r = pairedRig({ now: () => clock });
    try {
      await r.connection.prepare("codex");
      clock += LIMITS.invitationMs + 1;
      await r.connection.prepare("codex");
      expect(r.sockets).toHaveLength(2);
      expect(r.sockets[0]!.readyState).toBe(3);
      expect(r.connection.state().status).toBe("waiting");
    } finally { r.connection.dispose(); vi.restoreAllMocks(); }
  });
});

/** AX-U (AX.R2, C6): the whole setup as text for a terminal -- the client's commands, then the one connect line. */
describe("AX-U: connectionInstructions", () => {
  it("the setup commands, then the one line; never \"request only the permissions needed\"", () => {
    const text = connectionInstructions("codex", "https://agent.example.com/mcp", "inv-1");
    expect(text).toBe("codex mcp add socom2legacy --url https://agent.example.com/mcp\ncodex mcp login socom2legacy\n\nConnect to my SOCOM 2 Legacy page: https://agent.example.com/join/inv-1");
    for (const client of ["claude", "codex", "desktop", "other"] as const)
      expect(connectionInstructions(client, "https://agent.example.com", "inv-1"), client).not.toMatch(/only the permissions|request only/i);
  });
});

/** AX-12 (a browser adaptation): the connection doctor -- each failure sorted into one class, the agent told too. */
describe("AX-12: the connection doctor", () => {
  const ADDRESS = /\b\d{1,3}(\.\d{1,3}){3}\b|[0-9a-f]{1,4}(:[0-9a-f]{0,4}){3,}|candidate:|a=|sdp|placeholder|invitation1/i;
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
  function doctor(fetch: (url: string, init: RequestInit) => Promise<Response>) {
    const sockets: Socket[] = [];
    const connection = createAgentConnection({
      gateway: "http://127.0.0.1:5360",
      target: {
        read: () => ({ surface: "forge-editor" as const, revision: 0, name: "Map", build: "test" }),
        dispatch: async () => ({ requestId: "r", revision: 0, outcome: "ok" as const }),
      },
      fetch: vi.fn(fetch) as unknown as typeof globalThis.fetch,
      socket: () => {
        const s = new Socket();
        sockets.push(s);
        return s as unknown as WebSocket;
      },
    });
    return { connection, sockets };
  }
  async function classOf(fetch: (url: string, init: RequestInit) => Promise<Response>) {
    const { connection } = doctor(fetch);
    await connection.prepare("codex").catch(() => {});
    expect(connection.state().status).toBe("error");
    return connection.state().diagnosis?.class;
  }
  it("service-unreachable: the registration's fetch fails and the service cannot be reached at all", async () => {
    expect(await classOf(async () => { throw new TypeError("ECONNREFUSED 127.0.0.1:5360"); })).toBe("service-unreachable");
  });
  it("service-unreachable: the registration's fetch times out", async () => {
    vi.useFakeTimers();
    try {
      const { connection } = doctor((_url, init) => new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      }));
      const done = connection.prepare("codex").catch(() => {});
      await vi.advanceTimersByTimeAsync(LIMITS.requestMs + 1);
      await done;
      expect(connection.state().diagnosis).toEqual({ class: "service-unreachable" });
    } finally {
      vi.useRealTimers();
    }
  });
  it("service-unreachable: a 5xx or a 404", async () => {
    expect(await classOf(async () => new Response("down", { status: 503 }))).toBe("service-unreachable");
    expect(await classOf(async () => new Response("Not found", { status: 404 }))).toBe("service-unreachable");
  });
  it("origin-refused: ORIGIN_DENIED, or a refused read from a service that does answer", async () => {
    expect(await classOf(async () => json(403, { code: "ORIGIN_DENIED" }))).toBe("origin-refused");
    // A browser hides a cross-origin refusal as a network error; the service still answers a no-cors probe.
    const calls: { url: string; mode?: string }[] = [];
    expect(
      await classOf(async (url, init) => {
        calls.push({ url, mode: init.mode });
        if (init.mode === "no-cors") return new Response(null, { status: 200 });
        throw new TypeError("Failed to fetch");
      }),
    ).toBe("origin-refused");
    expect(calls.at(-1)).toEqual({ url: "http://127.0.0.1:5360/health", mode: "no-cors" });
  });
  it.each([
    [403, { code: "CAPACITY" }],
    [403, { code: "ADDRESS_CAPACITY" }],
    [429, {}],
    [429, { code: "RATE_LIMITED" }],
  ])("service-busy: %i %j", async (status, body) => {
    expect(await classOf(async () => json(status, body))).toBe("service-busy");
  });
  it("version: UNSUPPORTED_VERSION", async () => {
    expect(await classOf(async () => json(400, { code: "UNSUPPORTED_VERSION" }))).toBe("version");
  });
  it("unknown: a refusal the page cannot name", async () => {
    expect(await classOf(async () => json(403, {}))).toBe("unknown");
  });
  it.each([
    [{ type: "expired" }, "expired"],
    [{ type: "revoked", reason: "INVITATION_EXPIRED" }, "expired"],
    [{ type: "revoked", reason: "SESSION_EXPIRED" }, "expired"],
    [{ type: "revoked", reason: "UNSUPPORTED_VERSION" }, "version"],
    [{ type: "revoked", reason: "RTC_TIMEOUT" }, "route-failed"],
    [{ type: "revoked", reason: "AGENT_DISCONNECTED" }, "revoked"],
    [{ type: "revoked", reason: "SOMETHING_NEW" }, "revoked"],
  ])("the service's end %j reads %s", async (message, cls) => {
    const { connection, sockets } = doctor(async () => json(201, registration()));
    await connection.prepare("codex");
    sockets.at(-1)!.message(message);
    expect(connection.state().diagnosis?.class).toBe(cls);
  });
  it("expired: the invitation runs out on the page's own clock", async () => {
    vi.useFakeTimers();
    try {
      const { connection } = doctor(async () => json(201, registration()));
      await connection.prepare("codex");
      await vi.advanceTimersByTimeAsync(LIMITS.invitationMs + 1);
      expect(connection.state().diagnosis).toEqual({ class: "expired" });
    } finally {
      vi.useRealTimers();
    }
  });
  function candidate(type: string, address: string) {
    const line = `candidate:1 1 udp 2122260223 ${address} 54321 typ ${type}`;
    return { type, candidate: line, toJSON: () => ({ candidate: line, sdpMid: "0" }) };
  }
  it("route-failed: ICE fails -- an error, the counts seen (never an address), and the agent is told before the revoke", async () => {
    const r = pairedRig();
    await r.connection.prepare("codex");
    const socket = r.sockets.at(-1)!;
    socket.message({ type: "pending", pendingId: "p", clientName: "agent", comparisonCode: "123456", permissions: ["inspect"] });
    r.connection.approve(["inspect"]);
    socket.message({
      type: "offer", sessionId: "s", targetId: "target1", epoch: "epoch1", permissions: ["inspect"],
      sdp: "v=0\r\na=candidate:1 1 udp 1 203.0.113.9 3478 typ srflx\r\na=candidate:2 1 udp 1 192.0.2.3 9 typ host\r\n",
    });
    await vi.waitFor(() => expect(socket.sent.some((s) => JSON.parse(s).type === "answer")).toBe(true));
    const peer = r.peers.at(-1)!;
    for (const c of [candidate("host", "192.0.2.5"), candidate("host", "2001:db8::1"), candidate("srflx", "198.51.100.7")])
      peer.dispatchEvent(Object.assign(new Event("icecandidate"), { candidate: c }));
    socket.message({ type: "ice", sessionId: "s", targetId: "target1", epoch: "epoch1", candidate: { candidate: "candidate:3 1 udp 1 198.51.100.8 3478 typ relay" } });
    (peer as unknown as { connectionState: string }).connectionState = "failed";
    peer.dispatchEvent(new Event("connectionstatechange"));
    const state = r.connection.state();
    expect(state.status).toBe("error");
    expect(state.diagnosis).toEqual({
      class: "route-failed",
      local: { host: 2, srflx: 1, relay: 0 },
      remote: { host: 1, srflx: 1, relay: 1 },
    });
    const sent = socket.sent.map((s) => JSON.parse(s) as { type: string });
    const at = sent.findIndex((m) => m.type === "diagnosis");
    expect(at).toBeGreaterThan(-1);
    expect(sent[at]).toEqual({ type: "diagnosis", ...state.diagnosis });
    expect(sent.findIndex((m) => m.type === "revoke")).toBeGreaterThan(at);
    expect(socket.sent[at]).not.toMatch(ADDRESS);
    expect(JSON.stringify(state.diagnosis)).not.toMatch(ADDRESS);
    expect(state.error ?? "").not.toMatch(ADDRESS);
  });
  it("route-failed: the data channel never opens within its timeout", async () => {
    vi.useFakeTimers();
    try {
      const r = pairedRig();
      await r.connection.prepare("codex");
      const socket = r.sockets.at(-1)!;
      socket.message({ type: "pending", pendingId: "p", clientName: "agent", comparisonCode: "123456", permissions: ["inspect"] });
      r.connection.approve(["inspect"]);
      socket.message({ type: "offer", sessionId: "s", targetId: "target1", epoch: "epoch1", permissions: ["inspect"], sdp: "offer" });
      await vi.advanceTimersByTimeAsync(0);
      expect(r.connection.state().status).toBe("connecting");
      await vi.advanceTimersByTimeAsync(ROUTE_OPEN_MS + 1);
      expect(r.connection.state()).toMatchObject({ status: "error", diagnosis: { class: "route-failed" } });
    } finally {
      vi.useRealTimers();
    }
  });
  it("an opened channel clears the route timer; the player's own disconnect is no failure, and a new Copy clears the last one", async () => {
    vi.useFakeTimers();
    try {
      const r = pairedRig();
      await r.pair();
      await vi.advanceTimersByTimeAsync(ROUTE_OPEN_MS + 1);
      expect(r.connection.state()).toMatchObject({ status: "connected" });
      expect(r.connection.state().diagnosis).toBeUndefined();
      r.connection.disconnect();
      expect(r.connection.state().diagnosis).toBeUndefined();
      r.sockets.length = 0;
      await r.connection.prepare("codex");
      r.sockets.at(-1)!.message({ type: "revoked", reason: "AGENT_DISCONNECTED" });
      expect(r.connection.state().diagnosis).toEqual({ class: "revoked" });
      await r.connection.prepare("codex");
      expect(r.connection.state().diagnosis).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
  it("health: one GET /health, ready on {ok: true}, unreachable otherwise", async () => {
    const seen: { url: string; method?: string; credentials?: string }[] = [];
    const ok = doctor(async (url, init) => { seen.push({ url, method: init.method, credentials: init.credentials }); return json(200, { ok: true }); });
    expect(await ok.connection.health!()).toBe("ready");
    expect(seen).toEqual([{ url: "http://127.0.0.1:5360/health", method: "GET", credentials: "omit" }]);
    expect(await doctor(async () => json(200, { ok: false })).connection.health!()).toBe("unreachable");
    expect(await doctor(async () => { throw new TypeError("Failed to fetch"); }).connection.health!()).toBe("unreachable");
    expect(await doctor(async () => new Response("<html>", { status: 200 })).connection.health!()).toBe("unreachable");
  });
});

describe("AX-10: the pending signal's gateway client id", () => {
  it("keeps a bounded gatewayClientId on the pending state, and leaves it out when absent or malformed", async () => {
    for (const [sent, kept] of [["client-a_1", "client-a_1"], [undefined, undefined], ["bad id/with space", undefined], ["x".repeat(300), undefined]] as const) {
      const r = pairedRig();
      try {
        await r.connection.prepare("codex");
        r.sockets[0]!.message({ type: "pending", pendingId: "p", clientName: "agent", comparisonCode: "123456", permissions: ["inspect"],
          ...(sent === undefined ? {} : { gatewayClientId: sent }) });
        expect(r.connection.state().status).toBe("approval");
        expect(r.connection.state().pending?.gatewayClientId).toBe(kept);
        if (kept === undefined) expect("gatewayClientId" in r.connection.state().pending!).toBe(false);
      } finally {
        r.connection.dispose();
      }
    }
  });
});
