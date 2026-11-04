/// <reference types="vite/client" />
// The type reference above: packages/forge-agent/test imports this file, and its tsconfig has no vite client types.
import {
  authorizeRequest,
  bytes,
  encodeFrames,
  FrameReceiver,
  LIMITS,
  parseRequest,
  PERMISSIONS,
  identifier,
  OPERATIONS,
  type Operation,
  type AgentRequest,
  type AgentResult,
  type Capability,
  type Permission,
  type Surface,
} from "@s2u/forge-agent-protocol";
import type {
  AgentClient,
  AgentPanelController,
  AgentPanelState,
} from "./panel";

/**
 * R3-A (the FUI-4 review's finding 7; a browser adaptation): a line of the connection's own activity ring. A request's
 * result line names its request -- the operation, the outcome and code the connection sent, and whether the page's
 * target answered it (`routed`) or the connection refused it before the target (a permission, a lapsed session, a
 * revoked pairing): `./activity` `connectionNotes` records the unrouted ones as typed rows.
 */
export interface AgentConnectionLine {
  text: string;
  kind: "success" | "error" | "info";
  request?: {
    operation: string;
    outcome: AgentResult["outcome"];
    code?: string;
    routed: boolean;
  };
}

/** A dedicated typed seam, never the global viewer hook. The page owns the actual live-mode attestation. */
export interface PageAgentTarget {
  read(): {
    surface: Surface | "blocked";
    revision: number;
    name: string;
    build: string;
    map?: string | null;
  };
  dispatch(request: AgentRequest, signal: AbortSignal): Promise<AgentResult>;
  capture?(): Promise<Blob>;
  revoke?(reason: string): void;
}
interface Registration {
  targetId: string;
  pageToken: string;
  epoch: string;
  invitation: string;
  expiresAt: number;
}
export interface AgentConnectionOptions {
  gateway: string;
  target: PageAgentTarget;
  fetch?: typeof fetch;
  socket?: (url: string, protocols: string[]) => WebSocket;
  peer?: (configuration: RTCConfiguration) => RTCPeerConnection;
  iceServers?: RTCIceServer[];
  document?: Document;
  now?: () => number;
  operations?: Readonly<Record<string, Operation>>;
}

function safeGateway(value: string): URL {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash)
    throw new Error(
      "Use a connection service URL without credentials, query or fragment.",
    );
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local))
    throw new Error(
      "The connection service must use HTTPS (HTTP is allowed only on this device).",
    );
  if (url.pathname !== "/" && url.pathname !== "/mcp")
    throw new Error("Use the connection service origin or its /mcp address.");
  return new URL(url.origin);
}

export function connectionInstructions(
  client: AgentClient,
  address: string,
  invitation: string,
): string {
  const url = safeGateway(address);
  const endpoint = `${url.origin}/mcp`;
  const setup =
    client === "claude"
      // LATER 425 (browser adaptation): the user scope (every project) and, beside it, the local one (this project only).
      ? `claude mcp add --transport http --scope user socom2legacy ${endpoint}\nOr, for this project only:\nclaude mcp add --transport http --scope local socom2legacy ${endpoint}\nThen authenticate from /mcp in Claude Code.`
      : client === "codex"
        ? `codex mcp add socom2legacy --url ${endpoint}\ncodex mcp login socom2legacy`
        : `Add a Streamable HTTP MCP server named socom2legacy at ${endpoint}, then authorize it.`;
  return `Connect to my open SOCOM 2 Legacy development page.\n\n${setup}\n\nIf this server is already configured, reuse it. Guests can authorize without creating an account. Reload the client session if it needs that to discover the tools.\n\nUse agent_pair with invitation ${JSON.stringify(invitation)}. Request only the permissions needed for my task. Wait for me to approve the comparison code in the game page. Then use agent_capabilities and read this target before changing it. Every mutation must use its current revision and a unique request ID. If a response is lost, check the request receipt before repeating an edit.\n\nKeep local pack contents on the game device: use the approved local folder or staged file IDs. Never upload disc files or request arbitrary code execution. Development edits and teleport/map controls are unavailable during a Forge match.\n\nThis invitation expires in five minutes and does not itself grant access.`;
}

function actionLabel(operation: string): string {
  if (operation === 'target.capture') return 'Shared game view';
  if (operation === 'forge.edit') return 'Updated map';
  if (operation === 'forge.undo') return 'Undid map edit';
  if (operation === 'forge.redo') return 'Restored map edit';
  if (operation === 'testroom.teleport') return 'Moved to destination';
  if (operation === 'testroom.map') return 'Loaded map';
  if (operation.startsWith('packs.')) return 'Local pack';
  if (operation.startsWith('scenario.')) return 'Play test';
  if (operation === 'forge.input' || operation === 'testroom.input') return 'Player controls';
  if (operation === 'forge.play') return 'Started Play';
  if (operation === 'play.stop') return 'Returned to Build';
  if (operation.startsWith('forge.import')) return 'Map import';
  if (operation.startsWith('forge.export')) return 'Map export';
  return 'Read session';
}

export function createAgentConnection(
  options: AgentConnectionOptions,
): AgentPanelController & { refresh(): void; dispose(): void } {
  const gateway = safeGateway(options.gateway),
    now = options.now ?? Date.now;
  const fetcher = options.fetch ?? fetch;
  const makeSocket =
    options.socket ?? ((url, protocols) => new WebSocket(url, protocols));
  const makePeer =
    options.peer ?? ((configuration) => new RTCPeerConnection(configuration));
  const doc =
      options.document ??
      (typeof document === "undefined" ? undefined : document),
    operations = options.operations ?? OPERATIONS;
  const listeners = new Set<(state: AgentPanelState) => void>();
  let state: AgentPanelState = {
    status: "idle",
    target: options.target.read().name,
    permissions: [],
    activity: [],
  };
  let registration: Registration | null = null,
    signal: WebSocket | null = null;
  let peer: RTCPeerConnection | null = null,
    channel: RTCDataChannel | null = null,
    capability: Capability | null = null;
  let pendingId: string | null = null,
    approved: Permission[] | null = null;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  let abort = new AbortController(),
    generation = 0,
    queued = 0,
    disposed = false,
    closing = false;
  let queue = Promise.resolve(),
    tokens:number = LIMITS.commandBurst,
    rateAt = now();
  let sessionStarted = 0,
    lastUsed = 0,
    priorityBusy = false;
  let announcedSurface: Surface | null = null,
    remoteReady = false,
    flushingIce = false;
  const remoteCandidates: {
    sessionId: string;
    candidate: RTCIceCandidateInit;
  }[] = [];
  const frames = new FrameReceiver(now);
  function update(patch: Partial<AgentPanelState>): void {
    state = { ...state, ...patch };
    for (const listener of listeners) listener(state);
  }
  function activity(
    text: string,
    kind: "success" | "error" | "info" = "info",
    request?: AgentConnectionLine["request"],
  ): void {
    const line: AgentConnectionLine = {
      text: text.slice(0, 240),
      kind,
      ...(request ? { request } : {}),
    };
    update({ activity: [...state.activity.slice(-7), line] });
  }
  function sendSignal(value: unknown): boolean {
    if (signal?.readyState !== 1 || bytes(value) > LIMITS.controlBytes)
      return false;
    try {
      signal.send(JSON.stringify(value));
      return true;
    } catch {
      close("The connection service disconnected.", "error");
      return false;
    }
  }
  function close(
    reason: string,
    status: AgentPanelState["status"] = "disconnected",
  ): void {
    if (closing) return;
    closing = true;
    try {
      generation++;
      abort.abort();
      abort = new AbortController();
      clearTimeout(expiry);
      expiry = undefined;
      const prior = signal;
      signal = null;
      try {
        if (prior?.readyState === 1)
          prior.send(JSON.stringify({ type: "revoke" }));
      } catch {}
      try {
        prior?.close();
      } catch {}
      try {
        channel?.close();
      } catch {}
      channel = null;
      try {
        peer?.close();
      } catch {}
      peer = null;
      registration = null;
      capability = null;
      pendingId = null;
      approved = null;
      queued = 0;
      frames.clear();
      queue = Promise.resolve();
      tokens = LIMITS.commandBurst;
      rateAt = now();
      announcedSurface = null;
      remoteCandidates.length = 0;
      remoteReady = false;
      flushingIce = false;
      priorityBusy = false;
      try {
        options.target.revoke?.(reason);
      } catch {}
      update({
        status,
        permissions: [],
        pending: undefined,
        expiresAt: undefined,
        ...(status === "error" ? { error: reason } : { error: undefined }),
      });
    } finally {
      closing = false;
    }
  }
  async function sendData(
    value: unknown,
    scope = abort.signal,
    mine = generation,
  ): Promise<void> {
    if (!channel || channel.readyState !== "open")
      throw new Error("CONNECTION_CLOSED");
    const current = channel,
      started = now();
    const maximum = Math.min(
      LIMITS.chunkBytes,
      peer?.sctp?.maxMessageSize || LIMITS.chunkBytes,
    );
    for (const text of encodeFrames(value, maximum)) {
      while (current.bufferedAmount > LIMITS.controlBytes) {
        if (
          mine !== generation ||
          scope.aborted ||
          current.readyState !== "open"
        )
          throw new Error("CONNECTION_CLOSED");
        if (now() - started > LIMITS.requestMs)
          throw new Error("CONNECTION_BUSY");
        await new Promise((resolve) => setTimeout(resolve, 8));
      }
      if (mine !== generation || scope.aborted || current.readyState !== "open")
        throw new Error("CONNECTION_CLOSED");
      current.send(text);
    }
  }
  function refuse(request: AgentRequest, code: string): AgentResult {
    return {
      requestId: request.requestId,
      revision: options.target.read().revision,
      outcome: "refused",
      code,
    };
  }
  function permitted(request: AgentRequest): string | undefined {
    const live = options.target.read();
    if (!capability || !registration || abort.signal.aborted)
      return "NOT_PAIRED";
    if (live.surface === "blocked") return "SURFACE_DENIED";
    if (doc?.visibilityState === "hidden" || state.status === "paused")
      return "PAGE_PAUSED";
    if (
      now() - sessionStarted >= LIMITS.sessionAbsoluteMs ||
      now() - lastUsed >= LIMITS.sessionIdleMs
    )
      return "SESSION_EXPIRED";
    // Receipt lookup and revision comparison belong together in the target dispatcher.
    return authorizeRequest(
      request,
      { ...capability, surface: live.surface },
      operations,
    );
  }
  async function capture(
    request: AgentRequest,
    scope: AbortSignal,
  ): Promise<AgentResult> {
    const mine = generation;
    if (!options.target.capture) return refuse(request, "CAPTURE_UNAVAILABLE");
    let blob: Blob;
    try { blob = await options.target.capture(); }
    catch (error) {
      if (mine !== generation || scope.aborted) throw Error("CONNECTION_CLOSED");
      // No image transfer or mutation began. Expose only known capture failures, never internal encoder details.
      const message = error instanceof Error ? error.message : "";
      return refuse(request, ["CAPTURE_TIMEOUT", "CAPTURE_UNAVAILABLE"].includes(message) ? message : "CAPTURE_FAILED");
    }
    if (mine !== generation || scope.aborted) throw Error("CONNECTION_CLOSED");
    if (
      blob.size > LIMITS.transferBytes ||
      !["image/png", "image/jpeg"].includes(blob.type)
    )
      return refuse(request, "CAPTURE_TOO_LARGE");
    const data = new Uint8Array(await blob.arrayBuffer()),
      transferId = crypto.randomUUID();
    const digest = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", data)),
    ]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (mine !== generation || scope.aborted) throw Error("CONNECTION_CLOSED");
    const denied = permitted(request);
    if (denied) return refuse(request, denied);
    await sendData(
      {
        type: "image.begin",
        requestId: request.requestId,
        transferId,
        size: data.length,
        mimeType: blob.type,
      },
      scope,
      mine,
    );
    let index = 0;
    for (let at = 0; at < data.length; at += 12 * 1024) {
      if (mine !== generation || scope.aborted || permitted(request))
        throw Error("CONNECTION_CLOSED");
      const chunk = data.subarray(at, at + 12 * 1024);
      let binary = "";
      for (const b of chunk) binary += String.fromCharCode(b);
      await sendData(
        { type: "image.chunk", transferId, index: index++, data: btoa(binary) },
        scope,
        mine,
      );
    }
    await sendData({ type: "image.finish", transferId, digest }, scope, mine);
    return {
      requestId: request.requestId,
      revision: options.target.read().revision,
      outcome: "ok",
      data: { image: { transferId, mimeType: blob.type } },
    };
  }
  async function dispatchBounded(
    request: AgentRequest,
    scope: AbortSignal,
    deadline: number,
    routed: () => void = () => undefined,
  ): Promise<AgentResult> {
    if (scope.aborted) return refuse(request, "REVOKED");
    const remaining = deadline - now();
    if (remaining <= 0) return refuse(request, "QUEUE_TIMEOUT");
    const controller = new AbortController(),
      requestSignal = AbortSignal.any([scope, controller.signal]);
    let timer!: ReturnType<typeof setTimeout>, onAbort!: () => void;
    const cancelled = new Promise<AgentResult>((resolve) => {
      onAbort = () =>
        resolve({
          requestId: request.requestId,
          revision: options.target.read().revision,
          outcome: "unknown",
          code: "CONNECTION_CLOSED",
        });
      scope.addEventListener("abort", onAbort, { once: true });
      timer = setTimeout(() => {
        resolve({
          requestId: request.requestId,
          revision: options.target.read().revision,
          outcome: "unknown",
          code: "REQUEST_TIMEOUT",
        });
        controller.abort();
      }, remaining);
    });
    try {
      const answer =
        request.operation === "target.capture"
          ? capture(request, requestSignal)
          : (routed(), options.target.dispatch(request, requestSignal));
      return await Promise.race([answer, cancelled]);
    } finally {
      clearTimeout(timer);
      scope.removeEventListener("abort", onAbort);
    }
  }
  function onRequest(value: unknown): void {
    let request: AgentRequest;
    try {
      const envelope = value as { type?: unknown; request?: unknown };
      if (envelope?.type !== "request") return;
      request = parseRequest(envelope.request, operations);
    } catch {
      activity("A malformed command was refused.", "error");
      return;
    }
    // R5-B: the agent's camera.stop rides the stop lane too (never queued behind the rest); its checks are unchanged.
    const priority =
      request.operation === "scenario.cancel" ||
      request.operation === "play.stop" ||
      request.operation === "camera.stop";
    if (
      (priority && priorityBusy) ||
      (!priority && queued >= LIMITS.queuedCommands)
    ) {
      void sendData({
        type: "result",
        result: refuse(request, priority ? "STOP_IN_FLIGHT" : "QUEUE_FULL"),
      }).catch(() => {});
      return;
    }
    const elapsed = Math.max(0, now() - rateAt);
    tokens = Math.min(
      LIMITS.commandBurst,
      tokens + (elapsed * LIMITS.commandsPerSecond) / 1000,
    );
    rateAt = now();
    if (!priority && tokens < 1) {
      void sendData({
        type: "result",
        result: refuse(request, "RATE_LIMITED"),
      }).catch(() => {});
      return;
    }
    if (!priority) tokens--;
    else priorityBusy = true;
    queued++;
    const mine = generation,
      scope = abort.signal,
      deadline = now() + LIMITS.requestMs;
    const work = (priority ? Promise.resolve() : queue)
      .then(async () => {
        if (mine !== generation) return;
        const denied = permitted(request);
        let result: AgentResult;
        let routed = false;                                       // R3-A: the page's target saw it (its own typed row)
        if (denied) result = refuse(request, denied);
        else {
          lastUsed = now();
          try {
            result = await dispatchBounded(request, scope, deadline, () => {
              routed = true;
            });
          } catch {
            result = {
              requestId: request.requestId,
              revision: options.target.read().revision,
              outcome: "unknown",
              code: "ACTION_FAILED",
            };
          }
        }
        if (mine !== generation) return;
        try {
          await sendData({ type: "result", result });
          activity(
            `${actionLabel(request.operation)}: ${result.outcome === "ok" ? "complete" : "needs attention"}`,
            result.outcome === "ok" ? "success" : "error",
            {
              operation: request.operation,
              outcome: result.outcome,
              ...(result.code ? { code: result.code } : {}),
              routed,
            },
          );
        } catch {
          if (mine === generation)
            activity(
              "Response could not be delivered. Check the request receipt before retrying.",
              "error",
            );
        }
      })
      .catch(() => {
        if (mine === generation)
          activity("The connection could not process a command.", "error");
      })
      .finally(() => {
        if (mine === generation) {
          queued--;
          if (priority) priorityBusy = false;
        }
      });
    if (!priority) queue = work;
  }
  async function offered(message: Record<string, unknown>): Promise<void> {
    if (
      capability ||
      !registration ||
      !approved ||
      !pendingId ||
      message.targetId !== registration.targetId ||
      message.epoch !== registration.epoch ||
      !identifier(message.sessionId) ||
      typeof message.sdp !== "string" ||
      !message.sdp.length ||
      options.target.read().surface === "blocked" ||
      doc?.visibilityState === "hidden"
    )
      return;
    if (
      !Array.isArray(message.permissions) ||
      !message.permissions.length ||
      message.permissions.length !== approved.length ||
      new Set(message.permissions).size !== message.permissions.length ||
      message.permissions.some((p) => !approved!.includes(p as Permission))
    )
      return;
    const mine = generation;
    // The grant exists during asynchronous RTC negotiation. Per-frame page refreshes must see its real clock.
    sessionStarted = lastUsed = now();
    capability = {
      sessionId: message.sessionId,
      targetId: registration.targetId,
      epoch: registration.epoch,
      permissions: message.permissions as Permission[],
      surface: options.target.read().surface as Surface,
    };
    update({
      status: "connecting",
      pending: undefined,
      permissions: capability.permissions,
    });
    peer?.close();
    peer = makePeer({ iceServers: options.iceServers ?? [] });
    const current = peer;
    const candidates: RTCIceCandidate[] = [];
    let answerSent = false;
    const binding = {
      sessionId: capability.sessionId,
      targetId: capability.targetId,
      epoch: capability.epoch,
    };
    current.addEventListener("icecandidate", (event) => {
      if (!event.candidate || mine !== generation) return;
      if (!answerSent) candidates.push(event.candidate);
      else
        sendSignal({
          type: "ice",
          ...binding,
          candidate: event.candidate.toJSON(),
        });
    });
    current.addEventListener("datachannel", (event) => {
      if (
        mine !== generation ||
        event.channel.label !== "s2u-agent-v1" ||
        event.channel.protocol !== "s2u-agent-v1" ||
        !event.channel.ordered ||
        event.channel.maxRetransmits !== null ||
        event.channel.maxPacketLifeTime !== null ||
        channel
      ) {
        event.channel.close();
        return;
      }
      channel = event.channel;
      channel.addEventListener("open", () => {
        if (mine !== generation) return;
        lastUsed = now();
        update({ status: "connected", expiresAt: undefined });
        activity("Connected to this page. You are in control.");
        clearTimeout(expiry);
        expiry = setTimeout(
          () => close("Session expired. Pair this page again."),
          Math.max(0, LIMITS.sessionAbsoluteMs - (now() - sessionStarted)),
        );
      });
      channel.addEventListener("message", (event) => {
        if (mine !== generation) return;
        if (
          typeof event.data !== "string" ||
          new TextEncoder().encode(event.data).length > LIMITS.chunkBytes
        ) {
          close(
            "The page connection sent an invalid message. Pair again.",
            "error",
          );
          return;
        }
        try {
          const value = frames.push(event.data);
          if (value !== undefined) onRequest(value);
        } catch {
          close(
            "The page connection sent an invalid message. Pair again.",
            "error",
          );
        }
      });
      channel.addEventListener("error", () => {
        if (mine === generation)
          close("The page connection closed. Pair again.", "error");
      });
      channel.addEventListener("close", () => {
        if (mine === generation)
          close("The page connection closed. Pair again to resume.");
      });
    });
    current.addEventListener("connectionstatechange", () => {
      if (
        mine === generation &&
        ["closed", "failed", "disconnected"].includes(current.connectionState)
      )
        close("The page connection closed. Pair again to resume.");
    });
    await current.setRemoteDescription({ type: "offer", sdp: message.sdp });
    if (mine !== generation || abort.signal.aborted) {
      current.close();
      return;
    }
    remoteReady = true;
    await flushRemoteIce(current, mine);
    if (mine !== generation) return;
    const answer = await current.createAnswer();
    if (mine !== generation) {
      current.close();
      return;
    }
    await current.setLocalDescription(answer);
    if (mine !== generation || !capability) return;
    sendSignal({
      type: "answer",
      ...binding,
      sdp: current.localDescription?.sdp ?? answer.sdp,
    });
    answerSent = true;
    for (const candidate of candidates)
      sendSignal({ type: "ice", ...binding, candidate: candidate.toJSON() });
  }
  async function flushRemoteIce(
    current: RTCPeerConnection,
    mine: number,
  ): Promise<void> {
    if (flushingIce || !remoteReady) return;
    flushingIce = true;
    try {
      while (
        remoteCandidates.length &&
        mine === generation &&
        current === peer
      ) {
        const candidate = remoteCandidates.shift()!;
        if (candidate.sessionId !== capability?.sessionId) continue;
        await current.addIceCandidate(candidate.candidate);
      }
    } finally {
      if (mine === generation) flushingIce = false;
    }
  }
  function onSignal(event: MessageEvent): void {
    if (
      typeof event.data !== "string" ||
      new TextEncoder().encode(event.data).length > LIMITS.controlBytes
    )
      return;
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(event.data) as Record<string, unknown>;
      if (!message || typeof message !== "object") return;
    } catch {
      return;
    }
    if (
      message.type === "pending" &&
      identifier(message.pendingId) &&
      typeof message.clientName === "string" &&
      typeof message.comparisonCode === "string" &&
      Array.isArray(message.permissions) &&
      message.permissions.length > 0 &&
      message.permissions.length <= PERMISSIONS.length &&
      new Set(message.permissions).size === message.permissions.length &&
      message.permissions.every((p) => PERMISSIONS.includes(p as Permission))
    ) {
      if (capability || pendingId || state.status !== "waiting") return;
      pendingId = message.pendingId;
      approved = null;
      update({
        status: "approval",
        pending: {
          clientName: message.clientName.slice(0, 100),
          comparisonCode: message.comparisonCode.slice(0, 24),
          permissions: message.permissions as Permission[],
        },
      });
    } else if (message.type === "offer") {
      const mine = generation;
      void offered(message).catch(() => {
        if (mine === generation)
          close(
            "Could not establish the page connection. Try pairing again.",
            "error",
          );
      });
    } else if (
      message.type === "ice" &&
      registration &&
      approved &&
      identifier(message.sessionId) &&
      message.targetId === registration.targetId &&
      message.epoch === registration.epoch &&
      (!capability || message.sessionId === capability.sessionId)
    ) {
      if (remoteCandidates.length >= 32 || bytes(message.candidate) > 8192) {
        close("The network route could not be established.", "error");
        return;
      }
      remoteCandidates.push({
        sessionId: message.sessionId,
        candidate: message.candidate as RTCIceCandidateInit,
      });
      const mine = generation,
        current = peer;
      if (current && remoteReady)
        void flushRemoteIce(current, mine).catch(() => {
          if (mine === generation)
            close("The network route could not be established.", "error");
        });
    } else if (message.type === "revoked" || message.type === "expired")
      close("This connection ended. Copy fresh instructions to pair again.");
  }
  const visibility = () => {
    if (
      doc?.visibilityState === "hidden" &&
      (registration || capability || state.status === "creating")
    )
      close("PAGE_PAUSED", "paused");
    // Deliberate resume through a new pairing, never silently resume a running test after suspension.
  };
  const unload = () => close("PAGE_CLOSED");
  doc?.addEventListener("visibilitychange", visibility);
  doc?.defaultView?.addEventListener("pagehide", unload);
  function refresh(): void {
    if (closing || disposed) return;
    const live = options.target.read();
    if (live.surface === "blocked") {
      if (registration || capability || state.status === "creating")
        close("SURFACE_DENIED");
      return;
    }
    if (doc?.visibilityState === "hidden") {
      visibility();
      return;
    }
    if (
      announcedSurface &&
      (announcedSurface === "testroom-solo") !==
        (live.surface === "testroom-solo")
    ) {
      close("SURFACE_DENIED");
      return;
    }
    if (registration && announcedSurface !== live.surface) {
      if (sendSignal({ type: "surface", surface: live.surface }))
        announcedSurface = live.surface;
      if (capability) capability = { ...capability, surface: live.surface };
    }
    if (
      capability &&
      (now() - sessionStarted >= LIMITS.sessionAbsoluteMs ||
        now() - lastUsed >= LIMITS.sessionIdleMs)
    )
      close("Session expired. Pair this page again.");
  }
  return {
    state: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh,
    async prepare(client) {
      if (disposed) throw new Error("This page connection has closed.");
      if (doc?.visibilityState === "hidden")
        throw Error("Keep this page visible while connecting your agent.");
      // LATER 444: a granted session is never replaced by a Copy, whether or not its invitation has expired since.
      if (
        registration &&
        (capability ||
          (registration.expiresAt > now() && signal?.readyState === 1))
      )
        return connectionInstructions(
          client,
          `${gateway.origin}/mcp`,
          registration.invitation,
        );
      // Internal replacement keeps this Copy operation alive; explicit disconnect still cancels it.
      if (registration) close("REPLACED", "creating");
      else {
        generation++;
        abort.abort();
        abort = new AbortController();
        queue = Promise.resolve();
        queued = 0;
        frames.clear();
      }
      const live = options.target.read();
      if (live.surface === "blocked")
        throw new Error(
          "Leave the active match before connecting development tools.",
        );
      update({ status: "creating", error: undefined, target: live.name });
      const mine = generation;
      const failed = (error: string): never => {
        update({ status: "error", error });
        throw new Error(state.error);
      };
      // LATER 437: worded by cause; only a service that is not there is told it is not hosted.
      const unavailable = (): never =>
        failed(
          import.meta.env.DEV
            ? "Start the local connection service and page with npm run forge:agent, then try again."
            : "The connection service is not hosted for this page yet.",
        );
      const answered = (status: number): never =>
        status === 429
          ? failed("The connection service is busy. Try again shortly.")
          : status >= 500
            ? failed("The connection service is unavailable. Try again shortly.")
            : status === 404
              ? unavailable()
              // The review's F3: a hosted gateway that refuses (400, 403, 413) is there, so not "not hosted".
              : failed("The connection service refused this page's request.");
      let response: Response;
      let registered: unknown;
      const requestAbort = new AbortController();
      const requestTimer = setTimeout(() => requestAbort.abort(), LIMITS.requestMs);
      try {
        try {
          response = await fetcher(`${gateway.origin}/api/v1/targets`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "omit",
            body: JSON.stringify({
              surface: live.surface,
              name: live.name,
              build: live.build,
              ...(live.map ? { map: live.map } : {}),
            }),
            signal: AbortSignal.any([abort.signal, requestAbort.signal]),
          });
        } catch {
          if (mine !== generation || disposed || abort.signal.aborted)
            throw new Error("Connection was cancelled.");
          if (requestAbort.signal.aborted)
            return failed("The connection service did not answer in time. Try again shortly.");
          return unavailable();
        }
        if (mine !== generation || disposed)
          throw new Error("Connection was cancelled.");
        if (!response.ok) return answered(response.status);
        try {
          registered = await response.json();
        } catch {
          if (mine !== generation || disposed)
            throw new Error("Connection was cancelled.");
          // The review's F4: a body that stalled past the limit was aborted by the timer -- a timeout, not unreadable.
          if (requestAbort.signal.aborted)
            return failed("The connection service did not answer in time. Try again shortly.");
          return failed("The connection service answered with something unreadable.");
        }
      } finally {
        clearTimeout(requestTimer);
      }
      const r = registered as Partial<Registration>;
      if (mine !== generation || disposed)
        throw new Error("Connection was cancelled.");
      if (
        !r ||
        !["targetId", "pageToken", "epoch", "invitation"].every((k) =>
          identifier(r[k as keyof Registration]),
        ) ||
        typeof r.expiresAt !== "number" ||
        !Number.isFinite(r.expiresAt) ||
        r.expiresAt <= now()
      )
        return failed("The service returned an invalid connection.");
      registration = r as Registration;
      announcedSurface = live.surface;
      const socketAddress = new URL("/signal", gateway);
      socketAddress.protocol = gateway.protocol === "https:" ? "wss:" : "ws:";
      signal = makeSocket(socketAddress.href, [
        "s2u-agent-v1",
        `auth.${registration.pageToken}`,
      ]);
      const current = signal;
      current.addEventListener("open", () => {
        if (mine === generation && signal === current) refresh();
      });
      current.addEventListener("message", (event) => {
        if (mine === generation) onSignal(event as MessageEvent);
      });
      current.addEventListener("close", () => {
        if (mine === generation && signal === current)
          close(
            "The connection service disconnected. Copy fresh instructions to try again.",
          );
      });
      current.addEventListener("error", () => {
        if (mine === generation && signal === current)
          close("Could not reach the connection service.", "error");
      });
      expiry = setTimeout(
        () => {
          if (!capability)
            close(
              "The invitation expired. Copy fresh instructions to try again.",
            );
        },
        Math.min(LIMITS.invitationMs, registration.expiresAt - now()),
      );
      update({ status: "waiting", target: live.name, expiresAt: registration.expiresAt });
      return connectionInstructions(
        client,
        `${gateway.origin}/mcp`,
        registration.invitation,
      );
    },
    approve(permissions) {
      if (!pendingId || !state.pending || state.status !== "approval") return;
      approved = [
        ...new Set(
          permissions.filter((p) => state.pending!.permissions.includes(p)),
        ),
      ];
      if (!approved.length) return;
      sendSignal({ type: "approve", pendingId, permissions: approved });
      update({ status: "connecting" });
    },
    deny() {
      close("DECLINED");
    },
    disconnect() {
      close("USER_DISCONNECTED");
    },
    dispose() {
      if (disposed) return;
      close("PAGE_CLOSED");
      disposed = true;
      listeners.clear();
      doc?.removeEventListener("visibilitychange", visibility);
      doc?.defaultView?.removeEventListener("pagehide", unload);
    },
  };
}
