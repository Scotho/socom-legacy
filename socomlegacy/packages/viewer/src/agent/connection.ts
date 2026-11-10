/// <reference types="vite/client" />
// The type reference above: packages/forge-agent/test imports this file, and its tsconfig has no vite client types.
import {
  authorizeRequest,
  bytes,
  CaptureRefusal,
  encodeFrames,
  FrameReceiver,
  LIMITS,
  parseRequest,
  PERMISSIONS,
  identifier,
  OPERATIONS,
  teach,
  type Operation,
  type AgentRequest,
  type AgentResult,
  type Capability,
  type Diagnosis,
  type DiagnosisClass,
  type Permission,
  type RouteCandidates,
  type Surface,
} from "@s2u/forge-agent-protocol";
import type {
  AgentPanelController,
  AgentPanelState,
} from "./panel";
import { agentSetupRows, pairingText, safeGateway, type AgentClient } from "./setup";
import { tabSettings } from "../pageStore";
import { AGENT_CODE_WORDS } from "./codes";

/**
 * AX-9 (a browser adaptation): the tab's key for the gateway's one-time resume ticket -- kept in `sessionStorage`
 * (`../pageStore` `tabSettings`, in its inventory), so a reload of this tab finds it and a new tab does not. Its value:
 * `{ ticket, clientName, sessionId, gateway, permissions }` as JSON. Never put in a URL or a log.
 */
export const AGENT_RESUME_KEY = "forge.agent.resume";
/** AX-9: the store the ticket is kept in (the page's: `tabSettings`); any call may throw (a blocked storage). */
export interface AgentResumeStore {
  get(key: string): string | null;
  set(key: string, value: string): unknown;
  remove(key: string): unknown;
}
interface HeldResume {
  ticket: string;
  clientName: string;
  sessionId: string;
  gateway: string;
  permissions: Permission[];
}

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
  /**
   * AX-16 (plan item 16): the picture for one `target.capture` request -- its args name a preset view and a size
   * (`@s2u/forge-agent-protocol` `parseCaptureArgs`). No request (or `{}`): the canvas as it is. A refusal before any
   * picture is a thrown `CaptureRefusal`, answered as a refused result with its hint, the session kept.
   */
  capture?(request?: AgentRequest): Promise<Blob>;
  revoke?(reason: string): void;
  /**
   * AX-8 (AX.R4; a browser adaptation): the tab became hidden. The pairing stays; the target pauses what runs -- a
   * running camera shot ends `stopped`, a running scenario is cancelled, the agent's held Play inputs are released --
   * and nothing paused resumes by itself when the tab is visible again. Called once per hide.
   */
  pause?(reason: string): void;
}

/**
 * AX-8 (AX.R4): while the tab is hidden, new work that runs on the page's frames -- every `test`-permission operation
 * (Play, inputs, scenarios, the test room's input, teleport and map) and a camera shot -- is refused `PAGE_HIDDEN`.
 * The stop lane (`play.stop`, `scenario.cancel`, `camera.stop`) and the scenario's status read are never refused:
 * stopping or reading what the pause left is always allowed. Reads, edits, captures and the rest are not refused.
 */
const HIDDEN_ALLOWED: readonly string[] = ["play.stop", "scenario.cancel", "scenario.status", "camera.stop"];
export function refusedWhileHidden(operation: string, operations: Readonly<Record<string, Operation>> = OPERATIONS): boolean {
  if (HIDDEN_ALLOWED.includes(operation)) return false;
  return operation === "camera.shot" || operations[operation]?.permission === "test";
}
/**
 * AX-12 (the connection doctor; a browser adaptation): how long the page waits, from the agent's offer, for the WebRTC
 * data channel to open before it names the failure `route-failed`; and how long the Connect moment's `GET /health` and
 * the origin probe may take.
 */
export const ROUTE_OPEN_MS = 20_000;
export const HEALTH_MS = 5_000;
const BUSY_CODES: readonly string[] = ["CAPACITY", "ADDRESS_CAPACITY", "RATE_LIMITED"];
/** AX-12: a refused registration's class, from the gateway's code (`{code}` in its body) and the HTTP status. */
export function diagnoseRefusal(status: number, code?: string): DiagnosisClass {
  if (code === "ORIGIN_DENIED") return "origin-refused";
  if (code === "UNSUPPORTED_VERSION") return "version";
  if (status === 429 || (code !== undefined && BUSY_CODES.includes(code))) return "service-busy";
  if (status >= 500 || status === 404) return "service-unreachable";
  return "unknown";
}
/** AX-12: the class of an end the gateway signalled (`expired`, or `revoked` with its reason). */
export function diagnoseEnd(type: "revoked" | "expired", reason?: string): DiagnosisClass {
  if (type === "expired" || reason === "SESSION_EXPIRED" || reason === "INVITATION_EXPIRED") return "expired";
  if (reason === "UNSUPPORTED_VERSION") return "version";
  if (reason?.startsWith("RTC_")) return "route-failed";                     // forge-agent rtc.ts transport loss
  return "revoked";
}
/** AX-12: an ICE candidate's kind from its `type` or its `typ` field -- the kind only, never its address. */
function candidateKind(value: unknown): keyof RouteCandidates | undefined {
  const c = value as { type?: unknown; candidate?: unknown } | null;
  const kind = typeof c?.type === "string" ? c.type
    : typeof c?.candidate === "string" ? / typ (\w+)/.exec(c.candidate)?.[1] : undefined;
  return kind === "host" || kind === "srflx" || kind === "relay" ? kind : undefined;
}
const noCandidates = (): RouteCandidates => ({ host: 0, srflx: 0, relay: 0 });
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
  /** AX-9: where the resume ticket is kept (default: the tab's `sessionStorage`, `../pageStore` `tabSettings`). */
  resumeStore?: AgentResumeStore;
}

/**
 * AX-U (AX.R2, C6; a browser adaptation): the page's Copy is one line (`./setup` `pairingText`: "Connect to my SOCOM 2
 * Legacy page: <gateway>/join/<invitation>") -- the agent asks for every permission by default and the player opts out
 * on the page, so no copied text asks it to request less. This is the whole setup as text for a terminal
 * (`tools/forge-agent-dev.ts` prints its command lines): the client's setup rows -- Claude Code's two scopes worded as
 * LATER 425 left them -- then the line. An empty invitation gives the setup alone. The page never copies it.
 */
export function connectionInstructions(client: AgentClient, address: string, invitation: string): string {
  const rows = agentSetupRows(client, address).map((r) => r.text);
  const setup = client === "claude"
    ? `${rows[0]}\nOr, for this project only:\n${rows[1]}\nThen authenticate from /mcp in Claude Code.`
    : rows.join("\n");
  return invitation === "" ? setup : `${setup}\n\n${pairingText(address, invitation)}`;
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
): AgentPanelController & {
  refresh(): void;
  dispose(): void;
  health(): Promise<"ready" | "unreachable">;
  reconnect(): Promise<void>;
  forgetResume(): void;
} {
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
  // AX-9: the resume ticket, read and written with try/catch -- a storage that throws keeps nothing and offers nothing.
  // A duplicated tab gets a copy of this tab's sessionStorage, ticket included (REVIEW-1 finding 20): harmless, as the
  // ticket is single-use -- the gateway spends it on its first presentation, so at most one of the two tabs resumes and
  // the other is refused (`resume-refused`) and falls back to Connect; each still needs the player's own click.
  const resumeStore: AgentResumeStore = options.resumeStore ?? tabSettings;
  function readResume(): HeldResume | null {
    try {
      const value = JSON.parse(resumeStore.get(AGENT_RESUME_KEY) ?? "null") as Partial<HeldResume> | null;
      if (
        !value ||
        !identifier(value.ticket) ||
        !identifier(value.sessionId) ||
        typeof value.clientName !== "string" ||
        value.gateway !== gateway.origin ||
        !Array.isArray(value.permissions) ||
        !value.permissions.length ||
        value.permissions.length > PERMISSIONS.length ||
        new Set(value.permissions).size !== value.permissions.length ||
        !value.permissions.every((p) => PERMISSIONS.includes(p as Permission))
      )
        return null;
      return { ...(value as HeldResume), clientName: value.clientName.slice(0, 100) };
    } catch {
      return null;
    }
  }
  function writeResume(value: HeldResume): void {
    try {
      resumeStore.set(AGENT_RESUME_KEY, JSON.stringify(value));
    } catch {}
  }
  function dropResume(): void {
    try {
      resumeStore.remove(AGENT_RESUME_KEY);
    } catch {}
  }
  /** AX-9 / REVIEW-1 finding 7: what the Reconnect card shows -- the client and the grants the ticket gives back. */
  function resumeOffer(held: HeldResume): NonNullable<AgentPanelState["resume"]> {
    return { clientName: held.clientName, permissions: [...held.permissions] };
  }
  const heldAtLoad = readResume();
  let state: AgentPanelState = {
    status: "idle",
    target: options.target.read().name,
    permissions: [],
    activity: [],
    hidden: doc?.visibilityState === "hidden",
    ...(heldAtLoad ? { resume: resumeOffer(heldAtLoad) } : {}),
  };
  let registration: Registration | null = null,
    signal: WebSocket | null = null;
  let peer: RTCPeerConnection | null = null,
    channel: RTCDataChannel | null = null,
    capability: Capability | null = null;
  let pendingId: string | null = null,
    approved: Permission[] | null = null;
  // AX-9: the client's name (from its pending, or the ticket resumed) and a resume ticket waiting for the socket.
  let clientName = "",
    resuming: string | null = null,
    left = false;   // AX-9: this page left by a pagehide that kept its ticket; a later dispose keeps it too
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
  let hidden = doc?.visibilityState === "hidden";   // AX-8: the tab is hidden (the pairing kept, test work paused)
  let announcedSurface: Surface | null = null,
    remoteReady = false,
    flushingIce = false;
  const remoteCandidates: {
    sessionId: string;
    candidate: RTCIceCandidateInit;
  }[] = [];
  const frames = new FrameReceiver(now);
  // AX-12: the ICE candidates this pairing has seen, by kind (counts only), and the data channel's open deadline.
  let localSeen = noCandidates(),
    remoteSeen = noCandidates(),
    routeTimer: ReturnType<typeof setTimeout> | undefined;
  const route = (): Diagnosis => ({ class: "route-failed", local: { ...localSeen }, remote: { ...remoteSeen } });
  // AX-14: this pairing's notes to the agent (the page's own bounds mirror the gateway's: LIMITS.noteChars,
  // noteIntervalMs, notesQueued); they end with the pairing.
  let noteSeq = 0,
    noteAt = -Infinity;
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
    diagnosis?: Diagnosis,
    keepResume = false,
  ): void {
    if (closing) return;
    closing = true;
    try {
      // AX-9: every end but a pagehide discards the resume ticket; a pagehide told the gateway instead of revoking.
      if (keepResume) left = true;
      else if (!left) dropResume();
      resuming = null;
      generation++;
      abort.abort();
      abort = new AbortController();
      clearTimeout(expiry);
      expiry = undefined;
      clearTimeout(routeTimer);
      routeTimer = undefined;
      const prior = signal;
      signal = null;
      // AX-12: the agent learns the cause too -- the page's own finding goes to the gateway just before the revoke (an
      // end the gateway itself signalled, `revoked` or `expired`, is not echoed back to it).
      try {
        if (diagnosis && diagnosis.class !== "revoked" && diagnosis.class !== "expired" && prior?.readyState === 1)
          prior.send(JSON.stringify({ type: "diagnosis", ...diagnosis }));
      } catch {}
      try {
        if (prior?.readyState === 1 && !keepResume)
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
      noteAt = -Infinity;
      remoteCandidates.length = 0;
      remoteReady = false;
      flushingIce = false;
      priorityBusy = false;
      localSeen = noCandidates();
      remoteSeen = noCandidates();
      try {
        options.target.revoke?.(reason);
      } catch {}
      update({
        status,
        permissions: [],
        pending: undefined,
        expiresAt: undefined,
        diagnosis,
        resume: undefined,
        notes: [],
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
    if (
      now() - sessionStarted >= LIMITS.sessionAbsoluteMs ||
      now() - lastUsed >= LIMITS.sessionIdleMs
    )
      return "SESSION_EXPIRED";
    // Receipt lookup and revision comparison belong together in the target dispatcher.
    const denied = authorizeRequest(
      request,
      { ...capability, surface: live.surface },
      operations,
    );
    if (denied) return denied;
    // AX-8 (AX.R4): a hidden tab keeps the pairing and refuses only new test work and camera shots.
    if (doc?.visibilityState === "hidden" && refusedWhileHidden(request.operation, operations))
      return "PAGE_HIDDEN";
    return undefined;
  }
  async function capture(
    request: AgentRequest,
    scope: AbortSignal,
  ): Promise<AgentResult> {
    const mine = generation;
    if (!options.target.capture) return refuse(request, "CAPTURE_UNAVAILABLE");
    let blob: Blob;
    try { blob = await options.target.capture(request); }
    catch (error) {
      if (mine !== generation || scope.aborted) throw Error("CONNECTION_CLOSED");
      // AX-16: the target's own refusal of the preset (no picture taken, the camera untouched or restored), with its hint.
      if (error instanceof CaptureRefusal)
        return teach({ ...refuse(request, error.code), ...(error.hint ? { hint: error.hint } : {}) });
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
      // AX-8: a tab hidden after Allow still finishes pairing (the player brought the terminal over the browser).
      options.target.read().surface === "blocked"
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
    // AX-12: the offer's own candidates count as the service's; the route must open within ROUTE_OPEN_MS.
    for (const line of message.sdp.split(/\r?\n/)) {
      const kind = line.startsWith("a=candidate:") ? candidateKind({ candidate: line }) : undefined;
      if (kind) remoteSeen[kind]++;
    }
    clearTimeout(routeTimer);
    routeTimer = setTimeout(() => {
      if (mine === generation && channel?.readyState !== "open")
        close("The direct route to your agent did not open in time.", "error", route());
    }, ROUTE_OPEN_MS);
    current.addEventListener("icecandidate", (event) => {
      if (!event.candidate || mine !== generation) return;
      const kind = candidateKind(event.candidate);
      if (kind) localSeen[kind]++;
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
        clearTimeout(routeTimer);
        routeTimer = undefined;
        update({ status: "connected", expiresAt: undefined, diagnosis: undefined });
        activity("Connected to this page. You are in control.");
        clearTimeout(expiry);
        expiry = setTimeout(
          () => close("Session expired. Copy a fresh connect link to connect again.", "disconnected", { class: "expired" }),
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
            "The page connection sent an invalid message. Copy a fresh connect link to connect again.",
            "error",
          );
          return;
        }
        try {
          const value = frames.push(event.data);
          if (value !== undefined) onRequest(value);
        } catch {
          close(
            "The page connection sent an invalid message. Copy a fresh connect link to connect again.",
            "error",
          );
        }
      });
      channel.addEventListener("error", () => {
        if (mine === generation)
          close("The page connection closed. Copy a fresh connect link to connect again.", "error", { class: "unknown" });
      });
      channel.addEventListener("close", () => {
        if (mine === generation)
          close("The page connection closed. Copy a fresh connect link to connect again.");
      });
    });
    current.addEventListener("connectionstatechange", () => {
      if (mine !== generation) return;
      // AX-12: a failed connection is a failed route (ICE), named as such; a closed one ends as before.
      if (current.connectionState === "failed")
        close("The network route to your agent failed.", "error", route());
      else if (["closed", "disconnected"].includes(current.connectionState))
        close("The page connection closed. Copy a fresh connect link to connect again.");
    });
    current.addEventListener("iceconnectionstatechange", () => {
      if (mine === generation && current.iceConnectionState === "failed")
        close("The network route to your agent failed.", "error", route());
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
      clientName = message.clientName.slice(0, 100);
      // LATER 483 (fixed by FP-14): the gateway holds a pending pairing for its own approval window (`pending.created +
      // LIMITS.invitationMs`, LATER 432) and says `revoked` when it ends; the page's backstop restarts at the pending's
      // receipt (never before the gateway's end), and the invitation's countdown is over -- the person decides now.
      clearTimeout(expiry);
      expiry = setTimeout(() => {
        if (!capability) close("The approval window ended. Copy a fresh connect link to try again.", "disconnected", { class: "expired" });
      }, LIMITS.invitationMs);
      update({
        status: "approval",
        expiresAt: undefined,
        pending: {
          clientName: message.clientName.slice(0, 100),
          comparisonCode: message.comparisonCode.slice(0, 24),
          permissions: message.permissions as Permission[],
          // AX-10 (additive, AX.R8): the gateway's client id, kept only as a bounded identifier.
          ...(identifier(message.gatewayClientId) ? { gatewayClientId: message.gatewayClientId } : {}),
        },
      });
    } else if (message.type === "offer") {
      const mine = generation;
      void offered(message).catch(() => {
        if (mine === generation)
          close(
            "Could not establish the page connection. Copy a fresh connect link to try again.",
            "error",
            { class: "unknown" },
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
        close("The network route could not be established.", "error", route());
        return;
      }
      const kind = candidateKind(message.candidate);
      if (kind) remoteSeen[kind]++;
      remoteCandidates.push({
        sessionId: message.sessionId,
        candidate: message.candidate as RTCIceCandidateInit,
      });
      const mine = generation,
        current = peer;
      if (current && remoteReady)
        void flushRemoteIce(current, mine).catch(() => {
          if (mine === generation)
            close("The network route could not be established.", "error", route());
        });
    } else if (
      message.type === "resume-ticket" &&
      capability &&
      message.sessionId === capability.sessionId &&
      identifier(message.ticket)
    ) {
      // AX-9: kept in this tab only, so a reload can offer Reconnect; a fresh one follows every resume.
      writeResume({
        ticket: message.ticket,
        clientName: typeof message.clientName === "string" ? message.clientName.slice(0, 100) : clientName,
        sessionId: capability.sessionId,
        gateway: gateway.origin,
        permissions: [...capability.permissions],
      });
    } else if (message.type === "resume-refused" && resuming !== null && !capability) {
      // AX-9: an expired, wrong or used ticket -- back to the Connect moment, its reason in words.
      const code = typeof message.code === "string" ? message.code : "RESUME_REFUSED";
      close("RESUME_REFUSED");
      update({ error: AGENT_CODE_WORDS[code] ?? AGENT_CODE_WORDS.RESUME_REFUSED });
    } else if (
      (message.type === "note-delivered" || message.type === "note-refused") &&
      capability &&
      message.sessionId === capability.sessionId &&
      message.targetId === capability.targetId &&
      message.epoch === capability.epoch
    ) {
      // AX-14: the agent read these notes, or the gateway did not take one.
      const ids =
        message.type === "note-delivered"
          ? Array.isArray(message.noteIds) ? message.noteIds.filter(identifier) : []
          : identifier(message.noteId) ? [message.noteId] : [];
      const code = typeof message.code === "string" && /^[A-Z][A-Z_]{1,63}$/.test(message.code) ? message.code : "REFUSED";
      if (ids.length)
        update({
          notes: (state.notes ?? []).map((n) =>
            !ids.includes(n.id) || n.state !== "sent"
              ? n
              : message.type === "note-delivered"
                ? { ...n, state: "delivered" as const }
                : { ...n, state: "refused" as const, code },
          ),
        });
    } else if (message.type === "revoked" || message.type === "expired") {
      // AX-12: the service's end, sorted by its reason (counts kept for a failed route).
      const cls = diagnoseEnd(message.type, typeof message.reason === "string" ? message.reason : undefined);
      close("This connection ended. Copy a fresh connect link to connect again.", "disconnected",
        cls === "route-failed" ? route() : { class: cls });
    }
  }
  /**
   * AX-8 (AX.R4, replacing the close on hidden): a hidden tab keeps the pairing -- Chrome on Windows reports a window
   * another window fully covers as hidden. Each hide pauses the target once (what ran is stopped, never resumed by
   * itself: the old rule's "never silently resume a running test after suspension"); visible again accepts as before.
   * A registration or a pairing under way finishes as usual. Leaving the page (`pagehide`) still ends the pairing.
   */
  const visibility = () => {
    const now = doc?.visibilityState === "hidden";
    if (now === hidden) return;
    hidden = now;
    if (now && capability) {
      try {
        options.target.pause?.("PAGE_HIDDEN");
      } catch {}
    }
    update({ hidden: now });
  };
  /**
   * AX-9: a paired page holding its resume ticket tells the gateway it is leaving (`pagehide`) in place of revoking, and
   * keeps the ticket in its tab, so the reloaded page can offer Reconnect within RESUME_LIMITS.resumeMs. Anything
   * else -- no pairing, no ticket, a socket that will not take the message -- ends the pairing as before.
   */
  const unload = () => {
    const held = readResume();
    if (capability && held?.sessionId === capability.sessionId && sendSignal({ type: "pagehide" }))
      close("PAGE_CLOSED", "disconnected", undefined, true);
    else close("PAGE_CLOSED");
  };
  /**
   * AX-9 (REVIEW-1 finding 20): a page restored from the back-forward cache after its pagehide kept the ticket runs no
   * load again, so the Reconnect card is offered here -- once, on a `persisted` pageshow, when nothing is under way and
   * the tab still holds a valid ticket. As at load, nothing resumes without the player's click.
   */
  const restored = (event: Event) => {
    if (disposed || !(event as PageTransitionEvent).persisted) return;
    if (registration || capability || state.resume) return;
    const held = readResume();
    if (held) update({ resume: resumeOffer(held) });
  };
  doc?.addEventListener("visibilitychange", visibility);
  doc?.defaultView?.addEventListener("pagehide", unload);
  doc?.defaultView?.addEventListener("pageshow", restored);
  function refresh(): void {
    if (closing || disposed) return;
    const live = options.target.read();
    if (live.surface === "blocked") {
      if (registration || capability || state.status === "creating")
        close("SURFACE_DENIED");
      return;
    }
    visibility();   // AX-8: a missed visibility notice is caught here; hidden no longer ends or skips the refresh
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
      close("Session expired. Copy a fresh connect link to connect again.", "disconnected", { class: "expired" });
  }
  /**
   * AX-12: one cheap `GET /health` -- `ready` when the service answers `{ok: true}`, otherwise `unreachable` (a network
   * failure, a refusal, a timeout, an answer that is not the gateway's). Nothing else is read or kept.
   */
  async function health(): Promise<"ready" | "unreachable"> {
    const timer = new AbortController();
    const t = setTimeout(() => timer.abort(), HEALTH_MS);
    try {
      const r = await fetcher(`${gateway.origin}/health`, { method: "GET", credentials: "omit", signal: timer.signal });
      if (!r.ok) return "unreachable";
      const body = (await r.json()) as { ok?: unknown } | null;
      return body?.ok === true ? "ready" : "unreachable";
    } catch {
      return "unreachable";
    } finally {
      clearTimeout(t);
    }
  }
  /**
   * AX-12: a browser hides a cross-origin refusal as a network error. When the registration's fetch fails, an opaque
   * (no-cors) `GET /health` that still answers says the service is there and refused this page's origin.
   */
  async function answersOpaque(): Promise<boolean> {
    const timer = new AbortController();
    const t = setTimeout(() => timer.abort(), HEALTH_MS);
    try {
      await fetcher(`${gateway.origin}/health`, { method: "GET", mode: "no-cors", credentials: "omit", signal: timer.signal });
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(t);
    }
  }
  /** Connect (`resume` null: a fresh invitation) or AX-9's Reconnect (`resume`: the ticket held): register, then the socket. */
  async function begin(resume: HeldResume | null): Promise<string> {
      if (disposed) throw new Error("This page connection has closed.");
      if (doc?.visibilityState === "hidden")
        throw Error("Keep this page visible while connecting your agent.");
      left = false;
      // AX-9: Connect over a held ticket forgets it; nothing resumes by itself.
      if (!resume && state.resume) {
        dropResume();
        update({ resume: undefined });
      }
      // LATER 444: a granted session is never replaced by a Copy, whether or not its invitation has expired since.
      if (
        !resume &&
        registration &&
        (capability ||
          (registration.expiresAt > now() && signal?.readyState === 1))
      )
        return pairingText(gateway.origin, registration.invitation);
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
      update({ status: "creating", error: undefined, diagnosis: undefined, target: live.name });
      const mine = generation;
      // AX-12: every failure here carries its class (`diagnosis`) beside its words.
      const failed = (error: string, cls: DiagnosisClass = "unknown"): never => {
        update({ status: "error", error, diagnosis: { class: cls } });
        throw new Error(state.error);
      };
      // LATER 437: worded by cause; only a service that is not there is told it is not hosted.
      const unavailable = (): never =>
        failed(
          import.meta.env.DEV
            ? "Start the local connection service and page with npm run forge:agent, then try again."
            : "The connection service is not hosted for this page yet.",
          "service-unreachable",
        );
      const answered = (status: number, code?: string): never => {
        const cls = diagnoseRefusal(status, code);
        return cls === "origin-refused"
          ? failed("The connection service does not accept this page's address.", cls)
          : cls === "version"
            ? failed("The connection service speaks another version of the connection than this page.", cls)
            : cls === "service-busy"
              ? failed("The connection service is busy. Try again shortly.", cls)
              : status >= 500
                ? failed("The connection service is unavailable. Try again shortly.", cls)
                : status === 404
                  ? unavailable()
                  // The review's F3: a hosted gateway that refuses (400, 403, 413) is there, so not "not hosted".
                  : failed("The connection service refused this page's request.", cls);
      };
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
            return failed("The connection service did not answer in time. Try again shortly.", "service-unreachable");
          const refused = await answersOpaque();
          if (mine !== generation || disposed || abort.signal.aborted)
            throw new Error("Connection was cancelled.");
          if (refused) return failed("The connection service does not accept this page's address.", "origin-refused");
          return unavailable();
        }
        if (mine !== generation || disposed)
          throw new Error("Connection was cancelled.");
        if (!response.ok) {
          // AX-12: the refusal's code, when its body is the gateway's `{code}` (anything else reads no code).
          let code: string | undefined;
          try {
            const body = (await response.json()) as { code?: unknown } | null;
            if (typeof body?.code === "string" && /^[A-Z_]{1,64}$/.test(body.code)) code = body.code;
          } catch {}
          if (mine !== generation || disposed)
            throw new Error("Connection was cancelled.");
          return answered(response.status, code);
        }
        try {
          registered = await response.json();
        } catch {
          if (mine !== generation || disposed)
            throw new Error("Connection was cancelled.");
          // The review's F4: a body that stalled past the limit was aborted by the timer -- a timeout, not unreadable.
          if (requestAbort.signal.aborted)
            return failed("The connection service did not answer in time. Try again shortly.", "service-unreachable");
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
        return failed("The service returned an invalid connection.", "unknown");
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
        if (mine === generation && signal === current) {
          refresh();
          sendResume();
        }
      });
      current.addEventListener("message", (event) => {
        if (mine === generation) onSignal(event as MessageEvent);
      });
      current.addEventListener("close", () => {
        if (mine === generation && signal === current)
          close(
            "The connection service disconnected. Copy a fresh connect link to try again.",
            "disconnected",
            { class: "service-unreachable" },
          );
      });
      current.addEventListener("error", () => {
        if (mine === generation && signal === current)
          close("Could not reach the connection service.", "error", { class: "service-unreachable" });
      });
      expiry = setTimeout(
        () => {
          if (!capability)
            close(
              "The invitation expired. Copy a fresh connect link to try again.",
              "disconnected",
              { class: "expired" },
            );
        },
        Math.min(LIMITS.invitationMs, registration.expiresAt - now()),
      );
      if (resume) {
        // AX-9: the grants resumed are the ones the offer must carry (`offered`), as an approval's would be.
        resuming = resume.ticket;
        approved = [...resume.permissions];
        pendingId = "resume";
        clientName = resume.clientName;
        update({ status: "connecting", target: live.name, expiresAt: undefined, resume: undefined });
        sendResume();
        return "";
      }
      update({ status: "waiting", target: live.name, expiresAt: registration.expiresAt });
      return pairingText(gateway.origin, registration.invitation);
  }
  /** AX-9: the held ticket, sent once the socket is open (a test's socket may already be). */
  function sendResume(): void {
    if (resuming && !capability && sendSignal({ type: "resume", ticket: resuming })) resuming = "";
  }
  return {
    state: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh,
    health,
    async prepare(client) {
      void client;
      return begin(null);
    },
    /**
     * AX-9: the player pressed "Reconnect <client>" on the reloaded page. The page registers as usual, then sends its
     * ticket (`resume`) once the socket opens; the gateway re-binds the old session (its offer, the same grants) or
     * refuses (`resume-refused`), and the page falls back to Connect. The ticket is spent here either way.
     */
    async reconnect() {
      const held = readResume();
      dropResume();
      if (!held) {
        update({ resume: undefined });
        return;
      }
      await begin(held);
    },
    /** AX-9: the player chose Connect over Reconnect: the ticket is forgotten (the gateway's grant lapses by itself). */
    forgetResume() {
      dropResume();
      update({ resume: undefined });
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
    /**
     * AX-14 (a browser adaptation): a note to the agent over the signaling socket, `{type: "note", sessionId, targetId,
     * epoch, noteId, text}` -- plain text, trimmed, 1..`LIMITS.noteChars` characters, at most one a
     * `LIMITS.noteIntervalMs` and `LIMITS.notesQueued` waiting unread; the gateway holds the same bounds.
     */
    sendNote(input) {
      const text = typeof input === "string" ? input.trim() : "";
      if (!capability || state.status !== "connected") return "NOT_PAIRED";
      if (!text || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(text)) return "INVALID_NOTE";
      if (text.length > LIMITS.noteChars) return "NOTE_TOO_LONG";
      const notes = state.notes ?? [];
      if (notes.filter((n) => n.state === "sent").length >= LIMITS.notesQueued) return "NOTE_QUEUE_FULL";
      if (now() - noteAt < LIMITS.noteIntervalMs) return "NOTE_RATE_LIMITED";
      const id = `note-${++noteSeq}`;
      if (
        !sendSignal({
          type: "note",
          sessionId: capability.sessionId,
          targetId: capability.targetId,
          epoch: capability.epoch,
          noteId: id,
          text,
        })
      )
        return "CONNECTION_CLOSED";
      noteAt = now();
      update({ notes: [...notes, { id, text, state: "sent" as const }].slice(-LIMITS.notesQueued * 2) });
      return undefined;
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
      doc?.defaultView?.removeEventListener("pageshow", restored);
    },
  };
}
