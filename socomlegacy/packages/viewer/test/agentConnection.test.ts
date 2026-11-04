import { describe, expect, it, vi } from "vitest";
import {
  createAgentConnection,
  connectionInstructions,
} from "../src/agent/connection";
import {
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
    now?: () => number;
    capture?: () => Promise<Blob>;
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
  const base = {
    read: () => ({ surface, revision, name: "Map", build: "test" }),
    dispatch,
    revoke,
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
      const invitation = JSON.parse(
        /agent_pair with invitation ("[^"]+")/.exec(text)![1]!,
      );
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
  it("hidden pages abort running work and revoke instead of keeping an active channel", async () => {
    const doc = Object.assign(new EventTarget(), {
      visibilityState: "visible",
      defaultView: new EventTarget(),
    });
    let captured: AbortSignal | undefined;
    const r = pairedRig({
      document: doc as unknown as Document,
      dispatch: async (request, signal) => {
        captured = signal;
        await new Promise<void>((resolve) =>
          signal.addEventListener("abort", () => resolve(), { once: true }),
        );
        return {
          requestId: request.requestId,
          revision: 0,
          outcome: "unknown",
        };
      },
    });
    try {
      const { channel, socket } = await r.pair();
      channel.message({ type: "request", request: r.request() });
      await vi.waitFor(() => expect(captured).toBeDefined());
      doc.visibilityState = "hidden";
      doc.dispatchEvent(new Event("visibilitychange"));
      expect(captured?.aborted).toBe(true);
      expect(socket.readyState).toBe(3);
      expect(r.connection.state().status).toBe("paused");
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
    expect(text).toContain(
      "codex mcp add socom2legacy --url http://127.0.0.1:5360/mcp",
    );
    expect(text).toContain("invitation1");
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
      expect(text).toContain("http://127.0.0.1:5360/mcp");
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
