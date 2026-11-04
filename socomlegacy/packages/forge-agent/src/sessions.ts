import { createHash, randomBytes } from "node:crypto";
import { BlockList, isIP } from "node:net";
import {
  LIMITS,
  OPERATIONS,
  PERMISSIONS,
  SURFACES,
  authorizeRequest,
  parseRequest,
  object,
  bytes,
  type AgentRequest,
  type AgentResult,
  type Permission,
  type Surface,
  type Operation,
  type SignalToPage,
} from "@s2u/forge-agent-protocol";
import { createRtcPeer } from "./rtc.js";
import type { RTCPeerConnectionConfig } from "werift";
export interface PagePeer {
  offer(): Promise<string>;
  answer(sdp: string): Promise<void>;
  ice(candidate: unknown): Promise<void>;
  request(request: AgentRequest): Promise<AgentResult>;
  close(): Promise<void>;
}
export interface StateConfig {
  origins: readonly string[];
  now?: () => number;
  random?: () => string;
  peerFactory?: (
    signal: (candidate: unknown) => void,
    onDisconnect: (reason: string) => void,
  ) => PagePeer;
  operations?: Readonly<Record<string, Operation>>;
  maxTargets?: number;
  /** Browser adaptation (gateway policy): live unpaired targets one client address may hold (default 4). */
  maxTargetsPerAddress?: number;
  maxSessions?: number;
  /** Browser adaptation (gateway policy): pending and paired sessions one client address may hold (default 8). */
  maxSessionsPerAddress?: number;
  /** Browser adaptation (gateway policy): dial and reveal only public candidate addresses (production; LATER 430). */
  publicCandidatesOnly?: boolean;
  /**
   * Browser adaptation (the gateway's deploy, GW-F-1): every session peer's werift configuration -- its ICE servers and
   * UDP port range (`rtcConfigFromEnv`, FORGE_AGENT_ICE_SERVERS / FORGE_AGENT_ICE_PORTS). Unset: `{ iceServers: [] }`.
   */
  rtcConfig?: RTCPeerConnectionConfig;
}
interface Target {
  id: string;
  epoch: string;
  tokenHash: string;
  origin: string;
  /** The registering client's address, keying the per-address registration budget. */
  address: string;
  surface: Surface;
  name: string;
  build: string;
  map?: string;
  invitationHash: string;
  expiresAt: number;
  created: number;
  send?: (m: SignalToPage) => void;
  pending?: Pending;
  session?: Session;
}
interface Pending {
  id: string;
  sessionId: string;
  principal: string;
  /** The pairing client's address, keying the per-address session budget. */
  address: string;
  permissions: Permission[];
  created: number;
  clientName: string;
}
interface Session {
  id: string;
  principal: string;
  address: string;
  permissions: Permission[];
  created: number;
  last: number;
  peer: PagePeer;
  queued: number;
  chain: Promise<unknown>;
  tokens: number;
  tokenTime: number;
  revoked: boolean;
  priorityBusy: boolean;
  aborters: Set<() => void>;
  /** Remote ICE candidates the page has sent this session. */
  candidates: number;
}
/** Browser adaptation (gateway policy): remote ICE candidates one session may send -- the page's own cap (LATER 430). */
const MAX_REMOTE_CANDIDATES = 32;
const subnets = (ranges: readonly (readonly [string, number])[], family: "ipv4" | "ipv6") => {
  const list = new BlockList();
  for (const [ip, bits] of ranges) list.addSubnet(ip, bits, family);
  return list;
};
/**
 * LATER 430: the IPv4 ranges production neither dials nor reveals -- "this network" (0.0.0.0 among it), private,
 * shared (CGNAT), loopback, link-local (the cloud metadata address among it), IETF protocol assignments, benchmarking,
 * multicast (werift would send its STUN checks to the LAN group) and reserved (the limited broadcast 255.255.255.255
 * among it). Any other IPv4 address is public.
 */
const REFUSED_IPV4 = subnets(
  [
    ["0.0.0.0", 8],
    ["10.0.0.0", 8],
    ["100.64.0.0", 10],
    ["127.0.0.0", 8],
    ["169.254.0.0", 16],
    ["172.16.0.0", 12],
    ["192.0.0.0", 24],
    ["192.168.0.0", 16],
    ["198.18.0.0", 15],
    ["224.0.0.0", 4],
    ["240.0.0.0", 4],
  ],
  "ipv4",
);
/**
 * LATER 430: an IPv6 address is public only inside the global unicast range 2000::/3, so everything outside it is
 * refused by not being in it: the unspecified `::` and loopback `::1`, IPv4-mapped `::ffff:a.b.c.d` (it would reach
 * an IPv4 address this table never checked), NAT64 64:ff9b::/96 (a private IPv4 behind the box's NAT gateway),
 * unique-local fc00::/7, link-local fe80::/10 and multicast ff00::/8.
 */
const GLOBAL_UNICAST_IPV6 = subnets([["2000::", 3]], "ipv6");
/**
 * LATER 430: inside 2000::/3, the transition ranges that carry an IPv4 address the IPv4 table never sees: 6to4
 * 2002::/16 and Teredo 2001::/32 (2001:db8::/32, the documentation range, is outside it).
 */
const REFUSED_IPV6 = subnets(
  [
    ["2001::", 32],
    ["2002::", 16],
  ],
  "ipv6",
);
/**
 * LATER 430: the one decision every remote path takes (the answer's lines, every trickled candidate, the box's own
 * outbound candidates), an allowlist: a literal IPv4 address outside REFUSED_IPV4, or a literal IPv6 address inside
 * GLOBAL_UNICAST_IPV6 and outside REFUSED_IPV6. A zone (`%...`) is refused whatever it names: Node's isIPv6 accepts
 * one, BlockList strips it, and werift resolves a `.local` host by mDNS from the box.
 */
function publicAddress(address: string): boolean {
  if (address.includes("%")) return false;
  switch (isIP(address)) {
    case 4:
      return !REFUSED_IPV4.check(address, "ipv4");
    case 6:
      return GLOBAL_UNICAST_IPV6.check(address, "ipv6") && !REFUSED_IPV6.check(address, "ipv6");
    default:
      return false;
  }
}
/**
 * Browser adaptation (gateway policy): a candidate exactly as werift reads one -- Candidate.fromSdp takes field 4 of
 * `split(" ")` after IceCandidate.fromJSON strips one `candidate:` -- or nothing when the text is not printable ASCII
 * fields joined by single spaces: any other separator (tab, NBSP, a double space) would make werift dial another
 * host than the one checked here (LATER 430).
 */
const WERIFT_CANDIDATE = /^[\x21-\x7e]+( [\x21-\x7e]+){7,}$/;
function candidateAddress(text: string): string | undefined {
  const value = text.startsWith("candidate:") ? text.slice("candidate:".length) : text;
  return WERIFT_CANDIDATE.test(value) ? value.split(" ")[4] : undefined;
}
/**
 * Browser adaptation (gateway policy): a candidate -- an RTCIceCandidateInit or its SDP attribute -- whose address, read
 * as werift reads it, is a literal public IP (publicAddress). A name (mDNS `.local` or DNS) is never resolved; the
 * empty end-of-candidates marker passes.
 */
export function publicCandidate(candidate: unknown): boolean {
  const text =
    typeof candidate === "string"
      ? candidate
      : (candidate as { candidate?: unknown } | null)?.candidate;
  if (typeof text !== "string") return false;
  if (text === "") return true;
  return publicAddress(candidateAddress(text) ?? "");
}
/**
 * Browser adaptation (gateway policy): one of the box's own candidate attributes with its related address masked --
 * werift writes a server-reflexive candidate's `raddr`/`rport` as the box's own interface (LATER 430). Masked by
 * position, as werift reads its options (fields 8 onward, in pairs), never by a pattern over the text, so no fixed
 * field is rewritten. Only the box's offer and gathered candidates are masked; the page's answer never is.
 */
function maskRelated(text: string) {
  const bits = text.split(" ");
  for (let i = 8; i < bits.length - 1; i += 2)
    if (bits[i] === "raddr") bits[i + 1] = "0.0.0.0";
    else if (bits[i] === "rport") bits[i + 1] = "9";
  return bits.join(" ");
}
/** A gathered candidate -- an RTCIceCandidateInit or its SDP attribute -- with its related address masked. */
function maskCandidate(candidate: unknown): unknown {
  if (typeof candidate === "string") return maskRelated(candidate);
  const c = candidate as { candidate?: unknown } | null;
  return c && typeof c.candidate === "string"
    ? { ...c, candidate: maskRelated(c.candidate) }
    : candidate;
}
const candidateLines = (sdp: string) =>
  sdp.split("\n").filter((l) => l.startsWith("a=candidate:")).length;
/**
 * A description -- the gateway's offer or the page's answer -- with its non-public `a=candidate` lines removed; with
 * `mask`, the box's own offer, the related addresses of the rest masked too (LATER 430). The page's answer is only
 * filtered: its related address is the page's, not the box's. Its lines are split as werift splits them (`\r\n`,
 * else `\n`), so each line checked is the line werift parses.
 */
function publicSdp(sdp: string, mask: boolean) {
  const eol = sdp.split("\r\n").length > 1 ? "\r\n" : "\n";
  return sdp
    .split(eol)
    .filter(
      (l) => !l.startsWith("a=candidate:") || publicCandidate(l.slice(2)),
    )
    .map((l) => (mask && l.startsWith("a=candidate:") ? maskRelated(l) : l))
    .join(eol);
}
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const refused = (requestId: string, code: string): AgentResult => ({
  requestId,
  revision: 0,
  outcome: "refused",
  code,
});
/** In-memory capability authority. Restart intentionally requires a fresh guest login and page pairing. */
export class GatewayState {
  private readonly targets = new Map<string, Target>();
  private readonly now: () => number;
  private readonly random: () => string;
  readonly operations: Readonly<Record<string, Operation>>;
  constructor(private readonly config: StateConfig) {
    this.now = config.now ?? Date.now;
    this.random =
      config.random ?? (() => randomBytes(32).toString("base64url"));
    this.operations = config.operations ?? OPERATIONS;
  }
  /** `address` is the client's address as the gateway resolves it; in-process callers share one budget. */
  register(origin: string, input: unknown, address = "in-process") {
    this.sweep();
    if (!this.config.origins.includes(origin)) throw Error("ORIGIN_DENIED");
    // Registration is unauthenticated: one address cannot fill the global target cap and deny every real page.
    if (
      [...this.targets.values()].filter(
        (t) => t.address === address && !t.pending && !t.session,
      ).length >= (this.config.maxTargetsPerAddress ?? 4)
    )
      throw Error("ADDRESS_CAPACITY");
    if (this.targets.size >= (this.config.maxTargets ?? 128))
      throw Error("CAPACITY");
    const b = object(input);
    if (
      !SURFACES.includes(b.surface as Surface) ||
      typeof b.name !== "string" ||
      b.name.length > 100 ||
      typeof b.build !== "string" ||
      b.build.length > 128 ||
      (b.map !== undefined && (typeof b.map !== "string" || b.map.length > 128))
    )
      throw Error("INVALID_TARGET");
    const pageToken = this.random(),
      invitation = this.random().slice(0, 22),
      targetId = this.random(),
      epoch = this.random(),
      now = this.now();
    const t: Target = {
      id: targetId,
      epoch,
      tokenHash: hash(pageToken),
      invitationHash: hash(invitation),
      origin,
      address,
      surface: b.surface as Surface,
      name: b.name,
      build: b.build,
      map: b.map as string | undefined,
      created: now,
      expiresAt: now + LIMITS.invitationMs,
    };
    this.targets.set(targetId, t);
    return { targetId, pageToken, epoch, invitation, expiresAt: t.expiresAt };
  }
  attach(
    origin: string,
    pageToken: string,
    send: (m: SignalToPage) => void,
  ): { targetId: string; detach: () => void } {
    this.sweep();
    const h = hash(pageToken);
    const t = [...this.targets.values()].find((t) => t.tokenHash === h);
    // Browser adaptation (gateway policy): the page token travels in the socket's auth subprotocol, which an edge may
    // log, so it is a one-time ticket -- spent at attach, and good only for the attach window after registration
    // (LATER 433).
    if (
      !t ||
      t.origin !== origin ||
      !this.config.origins.includes(origin) ||
      t.send ||
      this.now() - t.created > LIMITS.requestMs
    )
      throw Error("PAGE_AUTH_DENIED");
    t.send = send;
    t.tokenHash = "";
    return {
      targetId: t.id,
      detach: () => {
        if (t.send === send) {
          t.send = undefined;
          this.revoke(t, "PAGE_DISCONNECTED");
          this.targets.delete(t.id);
        }
      },
    };
  }
  /** `address` is the pairing client's address as the gateway resolves it; in-process callers share one budget. */
  pair(
    principal: string,
    invitation: string,
    permissions: unknown,
    clientName: string,
    address = "in-process",
  ) {
    this.sweep();
    if (
      typeof invitation !== "string" ||
      invitation.length > 128 ||
      !Array.isArray(permissions) ||
      permissions.length === 0 ||
      permissions.length > PERMISSIONS.length ||
      permissions.some((p) => !PERMISSIONS.includes(p)) ||
      new Set(permissions).size !== permissions.length
    )
      throw Error("INVALID_PAIR");
    const h = hash(invitation);
    const t = [...this.targets.values()].find((t) => t.invitationHash === h);
    if (!t || t.expiresAt < this.now()) throw Error("INVITATION_EXPIRED");
    if (t.pending || t.session) throw Error("TARGET_BUSY");
    if (!t.send) throw Error("PAGE_OFFLINE");
    if (
      [...this.targets.values()].filter((t) => t.pending || t.session).length >=
      (this.config.maxSessions ?? 64)
    )
      throw Error("CAPACITY");
    // Pairing needs only a guest token: one address cannot hold every session slot (LATER 429).
    if (
      [...this.targets.values()].filter(
        (t) => (t.pending ?? t.session)?.address === address,
      ).length >= (this.config.maxSessionsPerAddress ?? 8)
    )
      throw Error("ADDRESS_CAPACITY");
    const pending: Pending = {
      id: this.random(),
      sessionId: this.random(),
      principal,
      address,
      permissions,
      created: this.now(),
      clientName: clientName.slice(0, 80),
    };
    t.pending = pending;
    t.invitationHash = "";
    // The person's approval window runs from the request, not from the invitation (LATER 432).
    t.expiresAt = Math.max(t.expiresAt, pending.created + LIMITS.invitationMs);
    const comparisonCode = this.random()
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 6)
      .toUpperCase();
    t.send({
      type: "pending",
      pendingId: pending.id,
      clientName: pending.clientName,
      comparisonCode,
      permissions: pending.permissions,
    });
    return {
      pendingId: pending.id,
      sessionId: pending.sessionId,
      targetId: t.id,
      epoch: t.epoch,
      comparisonCode,
      state: "pending",
    };
  }
  async signal(targetId: string, value: unknown): Promise<void> {
    if (bytes(value) > LIMITS.controlBytes) throw Error("SIGNAL_TOO_LARGE");
    this.sweep();
    const t = this.targets.get(targetId);
    if (!t || !t.send) throw Error("PAGE_OFFLINE");
    const m = object(value);
    if (m.type === "revoke") {
      this.revoke(t, "PAGE_REVOKED");
      this.targets.delete(t.id);
      return;
    }
    if (m.type === "surface") {
      if (
        !SURFACES.includes(m.surface as Surface) ||
        (t.surface === "testroom-solo") !== (m.surface === "testroom-solo")
      )
        throw Error("SURFACE_DENIED");
      t.surface = m.surface as Surface;
      return;
    }
    if (m.type === "approve") {
      const p = t.pending;
      if (
        !p ||
        p.id !== m.pendingId ||
        this.now() - p.created > LIMITS.invitationMs
      )
        throw Error("NO_PENDING");
      const grants = m.permissions;
      if (
        !Array.isArray(grants) ||
        grants.length === 0 ||
        grants.some((g) => !p.permissions.includes(g)) ||
        new Set(grants).size !== grants.length
      )
        throw Error("INVALID_GRANT");
      t.pending = undefined;
      const signalCandidate = (candidate: unknown) =>
        (!this.config.publicCandidatesOnly || publicCandidate(candidate)) &&
        t.send?.({
          type: "ice",
          sessionId: p.sessionId,
          targetId: t.id,
          epoch: t.epoch,
          candidate: this.config.publicCandidatesOnly
            ? maskCandidate(candidate)
            : candidate,
        });
      const onDisconnect = (reason: string) => {
        if (t.session?.id !== p.sessionId) return;
        this.revoke(t, reason);
        this.targets.delete(t.id);
      };
      const peer = this.config.peerFactory
        ? this.config.peerFactory(signalCandidate, onDisconnect)
        : createRtcPeer(signalCandidate, this.config.rtcConfig, onDisconnect);
      const now = this.now();
      const session: Session = {
        id: p.sessionId,
        principal: p.principal,
        address: p.address,
        permissions: grants,
        created: now,
        last: now,
        peer,
        queued: 0,
        chain: Promise.resolve(),
        tokens: LIMITS.commandBurst,
        tokenTime: now,
        revoked: false,
        priorityBusy: false,
        aborters: new Set(),
        candidates: 0,
      };
      t.session = session;
      try {
        const offer = await peer.offer(),
          sdp = this.config.publicCandidatesOnly ? publicSdp(offer, true) : offer;
        if (t.session !== session || session.revoked) {
          await peer.close();
          return;
        }
        t.send?.({
          type: "offer",
          sessionId: session.id,
          targetId: t.id,
          epoch: t.epoch,
          permissions: session.permissions,
          sdp,
        });
      } catch {
        this.revoke(t, "RTC_FAILED");
        throw Error("RTC_FAILED");
      }
      return;
    }
    const s = t.session;
    if (
      !s ||
      s.revoked ||
      m.sessionId !== s.id ||
      m.targetId !== t.id ||
      m.epoch !== t.epoch
    )
      throw Error("SIGNAL_BINDING_DENIED");
    if (
      m.type === "answer" &&
      typeof m.sdp === "string" &&
      m.sdp.length < LIMITS.controlBytes
    ) {
      // werift adds every `a=candidate` line of the answer as a remote candidate: the same cap and filter as trickle.
      s.candidates += candidateLines(m.sdp);
      if (s.candidates > MAX_REMOTE_CANDIDATES) throw Error("ICE_LIMIT");
      await s.peer.answer(
        this.config.publicCandidatesOnly ? publicSdp(m.sdp, false) : m.sdp,
      );
    } else if (m.type === "ice") {
      if (++s.candidates > MAX_REMOTE_CANDIDATES) throw Error("ICE_LIMIT");
      if (!this.config.publicCandidatesOnly || publicCandidate(m.candidate))
        await s.peer.ice(m.candidate);
    }
    else throw Error("INVALID_SIGNAL");
  }
  status(principal: string) {
    this.sweep();
    return {
      version: 1,
      sessions: [...this.targets.values()].flatMap((t) =>
        t.session?.principal === principal
          ? [
              {
                sessionId: t.session.id,
                targetId: t.id,
                epoch: t.epoch,
                surface: t.surface,
                name: t.name,
                permissions: t.session.permissions,
                state: "paired",
              },
            ]
          : t.pending?.principal === principal
            ? [
                {
                  sessionId: t.pending.sessionId,
                  targetId: t.id,
                  epoch: t.epoch,
                  state: "pending",
                },
              ]
            : [],
      ),
    };
  }
  async command(principal: string, value: unknown): Promise<AgentResult> {
    let r: AgentRequest;
    try {
      r = parseRequest(value, this.operations);
    } catch (e) {
      return refused(
        typeof (value as AgentRequest)?.requestId === "string"
          ? (value as AgentRequest).requestId
          : "invalid",
        (e as Error).message,
      );
    }
    this.sweep();
    const t = this.targets.get(r.targetId),
      s = t?.session;
    if (!t || !s || s.revoked || s.principal !== principal)
      return refused(r.requestId, "NOT_PAIRED");
    const error = authorizeRequest(
      r,
      {
        sessionId: s.id,
        targetId: t.id,
        epoch: t.epoch,
        permissions: s.permissions,
        surface: t.surface,
      },
      this.operations,
    );
    if (error) return refused(r.requestId, error);
    const now = this.now();
    s.tokens = Math.min(
      LIMITS.commandBurst,
      s.tokens + ((now - s.tokenTime) * LIMITS.commandsPerSecond) / 1000,
    );
    s.tokenTime = now;
    // R5-B (a browser adaptation): the agent's camera.stop joins the stop lane -- never queued behind a slow command or
    // rate-limited away -- after the same pairing and permission checks as every command (`authorizeRequest` above).
    const priority =
      r.operation === "scenario.cancel" ||
      r.operation === "play.stop" ||
      r.operation === "camera.stop";
    if (priority && s.priorityBusy)
      return refused(r.requestId, "STOP_IN_FLIGHT");
    if (!priority && s.tokens < 1) return refused(r.requestId, "RATE_LIMITED");
    if (!priority) s.tokens--;
    if (!priority && s.queued >= LIMITS.queuedCommands)
      return refused(r.requestId, "QUEUE_FULL");
    s.last = now;
    s.queued++;
    let timedOut = false,
      forwarded = false;
    let timeoutHandle!: ReturnType<typeof setTimeout>;
    const timeout = new Promise<AgentResult>((resolve) => {
      timeoutHandle = setTimeout(() => {
        timedOut = true;
        resolve(
          forwarded
            ? {
                requestId: r.requestId,
                revision: 0,
                outcome: "unknown",
                code: "REQUEST_TIMEOUT",
              }
            : refused(r.requestId, "QUEUE_TIMEOUT"),
        );
      }, LIMITS.requestMs);
    });
    let abort!: () => void;
    const revoked = new Promise<AgentResult>((resolve) => {
      abort = () => {
        timedOut = true;
        resolve({
          requestId: r.requestId,
          revision: 0,
          outcome: forwarded ? "unknown" : "refused",
          code: "REVOKED",
        });
      };
      s.aborters.add(abort);
    });
    if (priority) s.priorityBusy = true;
    const work = (priority ? Promise.resolve() : s.chain)
      .then(async () => {
        this.sweep();
        if (timedOut) return refused(r.requestId, "QUEUE_TIMEOUT");
        if (s.revoked || t.session !== s)
          return refused(r.requestId, "REVOKED");
        const liveError = authorizeRequest(
          r,
          {
            sessionId: s.id,
            targetId: t.id,
            epoch: t.epoch,
            permissions: s.permissions,
            surface: t.surface,
          },
          this.operations,
        );
        if (liveError) return refused(r.requestId, liveError);
        forwarded = true;
        return s.peer.request(r);
      })
      .catch(() => ({
        requestId: r.requestId,
        revision: 0,
        outcome: "unknown" as const,
        code: "CONNECTION_LOST",
      }))
      .finally(() => {
        s.queued--;
        clearTimeout(timeoutHandle);
        if (priority) s.priorityBusy = false;
      });
    if (!priority) s.chain = work;
    return Promise.race([work, timeout, revoked]).finally(() => {
      clearTimeout(timeoutHandle);
      s.aborters.delete(abort);
    });
  }
  async disconnect(principal: string, sessionId: string) {
    const t = [...this.targets.values()].find(
      (t) =>
        (t.session?.id === sessionId && t.session.principal === principal) ||
        (t.pending?.sessionId === sessionId &&
          t.pending.principal === principal),
    );
    if (!t) throw Error("NOT_PAIRED");
    this.revoke(t, "AGENT_DISCONNECTED");
    this.targets.delete(t.id);
    return { disconnected: true };
  }
  revokePrincipal(principal: string) {
    for (const t of this.targets.values())
      if (
        t.session?.principal === principal ||
        t.pending?.principal === principal
      ) {
        this.revoke(t, "AUTHORIZATION_REVOKED");
        this.targets.delete(t.id);
      }
  }
  private revoke(t: Target, reason: string) {
    const s = t.session;
    if (s) {
      s.revoked = true;
      for (const abort of s.aborters) abort();
      s.aborters.clear();
      void s.peer.close().catch(() => {});
    }
    t.session = undefined;
    t.pending = undefined;
    t.epoch = this.random();
    t.send?.({ type: "revoked", reason });
  }
  sweep() {
    const now = this.now();
    for (const t of this.targets.values()) {
      if (
        t.session &&
        (now - t.session.last > LIMITS.sessionIdleMs ||
          now - t.session.created > LIMITS.sessionAbsoluteMs)
      ) {
        this.revoke(t, "SESSION_EXPIRED");
        this.targets.delete(t.id);
      } else if (!t.session && now > t.expiresAt) {
        this.revoke(t, "INVITATION_EXPIRED");
        this.targets.delete(t.id);
      }
    }
  }
  async close() {
    const peers = [...this.targets.values()].flatMap((t) =>
      t.session ? [t.session.peer] : [],
    );
    for (const t of this.targets.values()) this.revoke(t, "GATEWAY_SHUTDOWN");
    this.targets.clear();
    await Promise.allSettled(peers.map((p) => p.close()));
  }
}
