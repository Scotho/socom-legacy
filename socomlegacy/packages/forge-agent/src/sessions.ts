import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { BlockList, isIP } from "node:net";
import {
  LIMITS,
  RESUME_LIMITS,
  OPERATIONS,
  PERMISSIONS,
  SURFACES,
  REFUSAL_HINTS,
  DIAGNOSIS_HINTS,
  parseDiagnosis,
  authorizeRequest,
  identifier,
  parseRequest,
  teach,
  object,
  bytes,
  type AgentNote,
  type AgentRequest,
  type AgentResult,
  type Permission,
  type Surface,
  type Operation,
  type SignalToPage,
  type Diagnosis,
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
  /** Browser adaptation (gateway policy): pending, paired and reload-held sessions in all (default 64; REVIEW-1 6). */
  maxSessions?: number;
  /** Browser adaptation (gateway policy): pending, paired and reload-held sessions one client address may hold (default 8). */
  maxSessionsPerAddress?: number;
  /**
   * Browser adaptation (gateway policy; REVIEW-1 6): the hard bound on grants held for a reload, lapsed ones (kept one
   * more window for their RESUME_EXPIRED) included; default twice maxSessions. Past it a leaving page ends as a revoke.
   */
  maxResumables?: number;
  /** Browser adaptation (gateway policy): dial and reveal only public candidate addresses (production; LATER 430). */
  publicCandidatesOnly?: boolean;
  /**
   * Browser adaptation (the gateway's deploy, GW-F-1): every session peer's werift configuration -- its ICE servers and
   * UDP port range (`rtcConfigFromEnv`, FORGE_AGENT_ICE_SERVERS / FORGE_AGENT_ICE_PORTS). Unset: `{ iceServers: [] }`.
   */
  rtcConfig?: RTCPeerConnectionConfig;
  /**
   * AX-10 (a browser adaptation, gateway policy): the OAuth client a pairing principal's grant was issued to
   * (`GuestOAuth.clientIdOf`; the gateway wires it). Its id goes on the `pending` signal as `gatewayClientId`, so the
   * page can recognise a remembered agent. Unset or unknown: the field is left out.
   */
  clientIdOf?: (principal: string) => string | undefined;
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
  /** AX-12: the page's latest diagnosis of a failed connection (counts only, `parseDiagnosis`). */
  diagnosis?: Diagnosis;
}
/**
 * AX-12 (the connection doctor; a browser adaptation): how long `agent_status` keeps telling an agent why its page's
 * connection failed after the session ended, and how many principals' diagnoses and ended targets the gateway holds.
 */
export const DIAGNOSIS_KEEP_MS = 10 * 60_000;
const DIAGNOSIS_KEEP_MAX = 1024;
/** AX-12: the agent's next step when the page reported a diagnosis -- the class named, then its hint. */
const nextDiagnosed = (d: Diagnosis) => `the page reported a failed connection (${d.class}): ${DIAGNOSIS_HINTS[d.class]}`;
interface Pending {
  id: string;
  sessionId: string;
  principal: string;
  /** The pairing client's address, keying the per-address session budget. */
  address: string;
  permissions: Permission[];
  created: number;
  clientName: string;
  comparisonCode: string;
}
/**
 * AX-3 (C4, a browser adaptation): what `agent_pair` and `agent_wait` answer -- the page approved (`paired`), declined or
 * ended the pairing (`declined`, its reason as `code`), or the wait ended first (`pending`, with how to wait again).
 */
export interface PairOutcome {
  state: "paired" | "pending" | "declined";
  sessionId: string;
  targetId: string;
  epoch?: string;
  pendingId?: string;
  comparisonCode?: string;
  permissions?: Permission[];
  code?: string;
  hint?: string;
  next: string;
}
/**
 * AX-3 (C4): `waitSeconds`' default and bounds. REVIEW-1 13: 45 s by default, under the clients' common 60 s tool
 * timeout, and 90 s at most, under an edge tunnel's ~100 s proxied-response limit; a client that times out first calls
 * agent_wait (the pairing stays pending).
 */
export const PAIR_WAIT_SECONDS = Object.freeze({ default: 45, min: 0, max: 90 });
/** REVIEW-1 20: how long, and how many, ended pending pairings are remembered so a late agent_wait answers `declined`. */
const ENDED_PENDING_KEEP_MS = LIMITS.invitationMs;
const ENDED_PENDING_KEEP_MAX = 256;
const NEXT_PAIRED =
  "paired: call agent_capabilities, then agent_request target.status (sessionId, targetId and epoch may be omitted while this is your only session)";
const nextPending = (code: string) =>
  `waiting for the player to Allow in the page (its code: ${code}): call agent_wait with this sessionId to keep waiting, or agent_status; do not call agent_pair again, the invitation is spent`;
/** AX-3 (C4): a join link's invitation segment -- what `register` makes (base64url), at most 128 characters. */
const INVITATION_SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;
/**
 * AX-3 (C4, a browser adaptation): the invitation from the raw invitation (today's bound: 1..128 characters, never a
 * path) or a join link `http(s)://<host>/join/<invitation>` -- exactly that path, no query, fragment or credentials;
 * anything else throws INVALID_INVITATION.
 */
export function parseInvitation(input: unknown): string {
  const bad = () => Error("INVALID_INVITATION");
  if (typeof input !== "string" || input.length === 0 || input.length > 2048) throw bad();
  if (!/^https?:\/\//i.test(input)) {
    if (input.length > 128 || input.includes("/")) throw bad();
    return input;
  }
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw bad();
  }
  const m = /^\/join\/([^/]+)$/.exec(url.pathname);
  if (url.search || url.hash || url.username || url.password || !m || !INVITATION_SEGMENT.test(m[1]!)) throw bad();
  return m[1]!;
}
/** AX-3 (C3): a thrown gateway code as the agent sees it -- the code and its hint. */
export const refusal = (code: string) => ({ code, hint: REFUSAL_HINTS[code] ?? REFUSAL_HINTS.REFUSED! });
interface Session {
  id: string;
  principal: string;
  address: string;
  permissions: Permission[];
  /** AX-9: the client name the agent gave at pairing (the reloaded page's "Reconnect <client>"). */
  clientName: string;
  /** AX-9: the hash of the page's current resume ticket ("" before one is issued); the ticket itself is never kept. */
  ticketHash: string;
  created: number;
  last: number;
  peer: PagePeer;
  queued: number;
  chain: Promise<unknown>;
  tokens: number;
  tokenTime: number;
  revoked: boolean;
  priorityBusy: boolean;
  aborters: Set<(code?: string) => void>;
  /** Remote ICE candidates the page has sent this session. */
  candidates: number;
  /** AX-14: the player's notes not yet delivered to the agent (at most `LIMITS.notesQueued`); they die with the session. */
  notes: (AgentNote & { id: string })[];
  /** AX-14: when the page's last note was taken (one a second, `LIMITS.noteIntervalMs`). */
  noteAt: number;
}
/**
 * AX-14 (a browser adaptation): why a note is not taken, or nothing -- plain text of 1..`LIMITS.noteChars` characters
 * once trimmed, no control characters but tab and newline; at most one a `LIMITS.noteIntervalMs`; at most
 * `LIMITS.notesQueued` undelivered.
 */
function noteRefusal(s: Session, text: unknown, now: number): string | undefined {
  if (typeof text !== "string" || !text.trim() || /[\u0000-\u0008\u000b-\u001f\u007f]/.test(text)) return "INVALID_NOTE";
  if (text.trim().length > LIMITS.noteChars) return "NOTE_TOO_LONG";
  if (s.notes.length >= LIMITS.notesQueued) return "NOTE_QUEUE_FULL";
  if (now - s.noteAt < LIMITS.noteIntervalMs) return "NOTE_RATE_LIMITED";
  return undefined;
}
/**
 * AX-9 (a browser adaptation): a paired page's grant kept after it left by `pagehide`, until RESUME_LIMITS.resumeMs
 * pass, the agent disconnects or its authorization is revoked. Bound to the page's one-time ticket by its hash.
 */
interface Resumable {
  ticketHash: string;
  sessionId: string;
  principal: string;
  address: string;
  permissions: Permission[];
  clientName: string;
  /** The session's start: the absolute lifetime keeps running through a reload. */
  created: number;
  origin: string;
  /** The test room's solo surface never trades places with the others (the `surface` signal's rule). */
  solo: boolean;
  expiresAt: number;
  /** AX-14: the player's notes not yet delivered when the page left; they ride the resumed session. */
  notes: (AgentNote & { id: string })[];
}
/** AX-9: the agent's `next` while its session waits for the reloaded page. */
const NEXT_RELOADING =
  "waiting for the player to reconnect after a reload: call agent_status again in a few seconds; once it reads paired, send requests without targetId and epoch";
/** AX-9 (as page tokens are compared): two hex digests, in constant time. */
function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
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
const refused = (requestId: string, code: string): AgentResult =>
  teach({
    requestId,
    revision: 0,
    outcome: "refused",
    code,
  });
/** In-memory capability authority. Restart intentionally requires a fresh guest login and page pairing. */
export class GatewayState {
  private readonly targets = new Map<string, Target>();
  /** AX-9: grants kept resumable after a pagehide, keyed by sessionId. */
  private readonly resumables = new Map<string, Resumable>();
  /** REVIEW-1 20, REVIEW-2 21: pending pairings the page ended (waiter attached or not), so a later agent_wait answers `declined`. */
  private readonly endedPending = new Map<string, { principal: string; outcome: PairOutcome; at: number }>();
  /** AX-3 (C4): at most one waiter per pending session, keyed by sessionId; every exit clears its timer. */
  private readonly waiters = new Map<
    string,
    { resolve: (o: PairOutcome) => void; timer: ReturnType<typeof setTimeout> }
  >();
  private readonly now: () => number;
  private readonly random: () => string;
  /** AX-12: the last diagnosis per principal whose session ended, and which principal an ended target belonged to. */
  private readonly diagnoses = new Map<string, { diagnosis: Diagnosis; at: number }>();
  private readonly ended = new Map<string, { principal: string; at: number }>();
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
  /**
   * AX-3 (C4): `invitation` is the raw invitation or its join link (`parseInvitation`); `permissions` defaults to all six
   * (AX.R2) and `clientName` to "MCP client".
   */
  pair(
    principal: string,
    invitation: unknown,
    permissions: unknown = [...PERMISSIONS],
    clientName: unknown = "MCP client",
    address = "in-process",
  ) {
    this.sweep();
    invitation = parseInvitation(invitation);
    if (
      typeof invitation !== "string" ||
      typeof clientName !== "string" ||
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
    const full = this.capacityRefusal(address);
    if (full) throw Error(full);
    const pending: Pending = {
      id: this.random(),
      sessionId: this.random(),
      principal,
      address,
      permissions,
      created: this.now(),
      clientName: clientName.slice(0, 80),
      comparisonCode: "",
    };
    t.pending = pending;
    t.invitationHash = "";
    this.diagnoses.delete(principal);   // AX-12: a fresh pairing's own outcome replaces the last failure
    // The person's approval window runs from the request, not from the invitation (LATER 432).
    t.expiresAt = Math.max(t.expiresAt, pending.created + LIMITS.invitationMs);
    const comparisonCode = this.random()
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 6)
      .toUpperCase();
    pending.comparisonCode = comparisonCode;
    // AX-10: the principal's registered client, only as a bounded identifier (the page's `identifier` rule).
    const gatewayClientId = this.config.clientIdOf?.(principal);
    t.send({
      type: "pending",
      pendingId: pending.id,
      clientName: pending.clientName,
      comparisonCode,
      permissions: pending.permissions,
      ...(identifier(gatewayClientId) ? { gatewayClientId } : {}),
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
  /**
   * The session caps, one rule for `pair` and `resume`: pending and paired sessions and (REVIEW-1 6) the grants held for
   * a reload's Reconnect count toward `maxSessions`, and toward `maxSessionsPerAddress` for their address -- pairing needs
   * only a guest token, so one address cannot hold every slot (LATER 429), nor loop pair, approve, pagehide past it.
   */
  private capacityRefusal(address: string): "CAPACITY" | "ADDRESS_CAPACITY" | undefined {
    const now = this.now();
    const live = [...this.resumables.values()].filter((r) => now <= r.expiresAt);
    const bound = [...this.targets.values()].flatMap((t) => (t.pending ?? t.session) ? [(t.pending ?? t.session)!.address] : []);
    if (bound.length + live.length >= (this.config.maxSessions ?? 64)) return "CAPACITY";
    if (bound.filter((a) => a === address).length + live.filter((r) => r.address === address).length >= (this.config.maxSessionsPerAddress ?? 8))
      return "ADDRESS_CAPACITY";
    return undefined;
  }
  /** AX-3 (C4): live waiters (tests read it to check every exit clears its own). */
  get waiting(): number {
    return this.waiters.size;
  }
  private settle(sessionId: string, outcome: PairOutcome) {
    const w = this.waiters.get(sessionId);
    if (!w) return;
    this.waiters.delete(sessionId);
    clearTimeout(w.timer);
    w.resolve(outcome);
  }
  /** AX-3 (C4): `pair`, then `wait` on its session -- `agent_pair` and `POST /api/v1/pair`. */
  async pairAndWait(
    principal: string,
    invitation: unknown,
    permissions?: unknown,
    clientName?: unknown,
    waitSeconds?: unknown,
    address?: string,
  ): Promise<PairOutcome> {
    const p = this.pair(principal, invitation, permissions, clientName, address);
    return this.wait(principal, p.sessionId, waitSeconds);
  }
  /**
   * AX-3 (C4, a browser adaptation): hold until the page approves this caller's pending session (`paired`), declines or
   * ends it (`declined`), or `waitSeconds` (default 45, held to 0..90) pass (`pending`). A second wait on the same
   * session replaces the first, which answers `pending`. A pending pairing the page ended -- with or without a waiter
   * attached -- still answers `declined` for a while (REVIEW-1 20, REVIEW-2 21). Unknown or another caller's session: NOT_PAIRED.
   */
  wait(principal: string, sessionId: unknown, waitSeconds: unknown = PAIR_WAIT_SECONDS.default): Promise<PairOutcome> {
    this.sweep();
    const seconds =
      typeof waitSeconds === "number" && Number.isFinite(waitSeconds)
        ? Math.min(PAIR_WAIT_SECONDS.max, Math.max(PAIR_WAIT_SECONDS.min, waitSeconds))
        : PAIR_WAIT_SECONDS.default;
    for (const t of this.targets.values()) {
      const s = t.session;
      if (s && s.id === sessionId && s.principal === principal && !s.revoked)
        return Promise.resolve(this.pairedOutcome(t, s.permissions));
      const p = t.pending;
      if (!p || p.sessionId !== sessionId || p.principal !== principal) continue;
      const pending: PairOutcome = {
        state: "pending",
        sessionId: p.sessionId,
        targetId: t.id,
        epoch: t.epoch,
        pendingId: p.id,
        comparisonCode: p.comparisonCode,
        next: nextPending(p.comparisonCode),
      };
      this.settle(p.sessionId, pending);
      if (seconds === 0) return Promise.resolve(pending);
      return new Promise((resolve) => {
        const timer = setTimeout(() => this.settle(p.sessionId, pending), seconds * 1000);
        this.waiters.set(p.sessionId, { resolve, timer });
      });
    }
    const ended = typeof sessionId === "string" ? this.endedPending.get(sessionId) : undefined;
    if (ended && ended.principal === principal) return Promise.resolve(ended.outcome);
    return Promise.reject(Error("NOT_PAIRED"));
  }
  private pairedOutcome(t: Target, permissions: Permission[]): PairOutcome {
    return {
      state: "paired",
      sessionId: t.session!.id,
      targetId: t.id,
      epoch: t.epoch,
      permissions,
      next: NEXT_PAIRED,
    };
  }
  async signal(targetId: string, value: unknown): Promise<void> {
    if (bytes(value) > LIMITS.controlBytes) throw Error("SIGNAL_TOO_LARGE");
    this.sweep();
    const t = this.targets.get(targetId);
    // AX-12: the page's diagnosis (sent before its revoke); one that arrives after the gateway ended the target still
    // reaches the agent whose session it was. It changes nothing but what agent_status says.
    if ((value as { type?: unknown } | null)?.type === "diagnosis") {
      const d = parseDiagnosis(value);
      if (t?.send) {
        t.diagnosis = d;
        return;
      }
      const e = this.ended.get(targetId);
      if (e && this.now() - e.at <= DIAGNOSIS_KEEP_MS) this.remember(e.principal, d);
      return;
    }
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
      return this.bind(t, {
        id: p.sessionId,
        principal: p.principal,
        address: p.address,
        permissions: grants,
        clientName: p.clientName,
        created: this.now(),
      });
    }
    if (m.type === "pagehide") {
      this.leave(t);
      return;
    }
    if (m.type === "resume") {
      this.resume(t, m.ticket);
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
    } else if (m.type === "note") {
      // AX-14 (a browser adaptation): a refused note is said to the page and the pairing kept -- a throw here would close
      // the page's signaling socket, and with it the pairing.
      if (m.noteId !== undefined && !identifier(m.noteId)) throw Error("INVALID_SIGNAL");
      const noteId = (m.noteId as string | undefined) ?? "note-" + this.random().slice(0, 16),
        now = this.now(),
        code = noteRefusal(s, m.text, now);
      if (code) {
        t.send({ type: "note-refused", sessionId: s.id, targetId: t.id, epoch: t.epoch, noteId, code });
        return;
      }
      s.noteAt = now;
      s.notes.push({ id: noteId, text: (m.text as string).trim(), at: new Date(now).toISOString() });
    }
    else throw Error("INVALID_SIGNAL");
  }
  /**
   * A granted session bound to `t`: a new RTC peer, its offer, then (AX-9) a fresh resume ticket. The approval and a
   * resume share it; a resume passes the session's own id, principal, grants and start.
   */
  private async bind(
    t: Target,
    base: Pick<Session, "id" | "principal" | "address" | "permissions" | "clientName" | "created"> &
      Partial<Pick<Session, "notes">>,
  ): Promise<void> {
    const signalCandidate = (candidate: unknown) =>
      (!this.config.publicCandidatesOnly || publicCandidate(candidate)) &&
      t.send?.({
        type: "ice",
        sessionId: base.id,
        targetId: t.id,
        epoch: t.epoch,
        candidate: this.config.publicCandidatesOnly
          ? maskCandidate(candidate)
          : candidate,
      });
    const onDisconnect = (reason: string) => {
      if (t.session?.id !== base.id) return;
      this.revoke(t, reason);
      this.targets.delete(t.id);
    };
    const peer = this.config.peerFactory
      ? this.config.peerFactory(signalCandidate, onDisconnect)
      : createRtcPeer(signalCandidate, this.config.rtcConfig, onDisconnect);
    const now = this.now();
    const session: Session = {
      ...base,
      ticketHash: "",
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
      // AX-14 x AX-9: a resumed session keeps the notes its player sent before the reload and not yet delivered.
      notes: base.notes ?? [],
      noteAt: -Infinity,
    };
    t.session = session;
    this.settle(session.id, this.pairedOutcome(t, session.permissions));
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
    // AX-9: the ticket that resumes this session after a reload -- single-use, hashed at rest, never in a URL or a log.
    const ticket = this.random();
    session.ticketHash = hash(ticket);
    t.send?.({ type: "resume-ticket", sessionId: session.id, ticket, clientName: session.clientName });
  }
  /**
   * AX-9: the paired page is leaving (`pagehide`). Its grant is kept resumable for RESUME_LIMITS.resumeMs under the
   * hash of the ticket it holds; the old binding ends -- its peer closed, its waiting requests answered PAGE_RELOADING --
   * and the target goes, without a word to the page, which is gone. A page with nothing to resume ends as a revoke.
   */
  private leave(t: Target) {
    const s = t.session;
    if (!s || s.revoked || !s.ticketHash || !this.roomToHold()) {
      this.revoke(t, "PAGE_REVOKED");
      this.targets.delete(t.id);
      return;
    }
    this.resumables.set(s.id, {
      ticketHash: s.ticketHash,
      sessionId: s.id,
      principal: s.principal,
      address: s.address,
      permissions: s.permissions,
      clientName: s.clientName,
      created: s.created,
      origin: t.origin,
      solo: t.surface === "testroom-solo",
      expiresAt: this.now() + RESUME_LIMITS.resumeMs,
      notes: s.notes,
    });
    s.revoked = true;
    for (const abort of s.aborters) abort("PAGE_RELOADING");
    s.aborters.clear();
    void s.peer.close().catch(() => {});
    t.session = undefined;
    t.send = undefined; // the socket's close that follows finds nothing left to revoke
    this.targets.delete(t.id);
  }
  /**
   * REVIEW-1 6: whether one more grant may be held under `maxResumables`; at the bound the oldest lapsed grant (kept only
   * for its RESUME_EXPIRED) gives way, and a live one never does.
   */
  private roomToHold(): boolean {
    const cap = this.config.maxResumables ?? 2 * (this.config.maxSessions ?? 64);
    if (this.resumables.size < cap) return true;
    const now = this.now();
    for (const [id, r] of this.resumables)
      if (now > r.expiresAt) {
        this.resumables.delete(id);
        return true;
      }
    return false;
  }
  /**
   * AX-9: the reloaded page's player pressed Reconnect. Within the window, on the origin the grant was made on, the
   * resumable session is bound to this page -- its new epoch, a new peer, the same sessionId, principal and grants. The
   * ticket is spent once it names a grant, whatever follows; a refusal is said to the page (`resume-refused`), which
   * falls back to Connect, and leaves this page an ordinary unpaired registration.
   */
  private resume(t: Target, ticket: unknown) {
    const refuse = (code: string) => t.send?.({ type: "resume-refused", code });
    if (t.pending || t.session) return refuse("TARGET_BUSY");
    if (typeof ticket !== "string" || ticket.length === 0 || ticket.length > 256) return refuse("RESUME_REFUSED");
    const h = hash(ticket);
    let found: Resumable | undefined;
    for (const r of this.resumables.values()) if (sameHash(r.ticketHash, h)) found = r;
    if (!found) return refuse("RESUME_REFUSED");
    this.resumables.delete(found.sessionId);
    const now = this.now();
    if (now > found.expiresAt || now - found.created > LIMITS.sessionAbsoluteMs) return refuse("RESUME_EXPIRED");
    if (found.origin !== t.origin) return refuse("RESUME_REFUSED");
    if (found.solo !== (t.surface === "testroom-solo")) return refuse("SURFACE_DENIED");
    // REVIEW-1 6: the same caps pair() keeps, before the grant binds (the found grant already left the held count).
    const full = this.capacityRefusal(found.address);
    if (full) return refuse(full);
    t.invitationHash = "";
    void this.bind(t, {
      id: found.sessionId,
      principal: found.principal,
      address: found.address,
      permissions: found.permissions,
      clientName: found.clientName,
      created: found.created,
      notes: found.notes,
    }).catch(() => {});
  }
  /** AX-9: the caller's resumable grant (one sessionId, or any), still inside its window. */
  private resumableFor(principal: string, sessionId?: unknown): Resumable | undefined {
    const now = this.now();
    for (const r of this.resumables.values())
      if (r.principal === principal && now <= r.expiresAt && (sessionId === undefined || sessionId === r.sessionId))
        return r;
    return undefined;
  }
  status(principal: string) {
    this.sweep();
    const sessions = [
      ...[...this.targets.values()].flatMap((t) =>
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
                next: t.diagnosis ? nextDiagnosed(t.diagnosis) : NEXT_PAIRED,
                ...(t.diagnosis ? { diagnosis: t.diagnosis } : {}),
                // AX-14: the player's undelivered notes, listed here and delivered only by a result or agent_notes.
                notes: t.session.notes.map(({ text, at }) => ({ text, at })),
              },
            ]
          : t.pending?.principal === principal
            ? [
                {
                  sessionId: t.pending.sessionId,
                  targetId: t.id,
                  epoch: t.epoch,
                  state: "pending",
                  next: t.diagnosis ? nextDiagnosed(t.diagnosis) : nextPending(t.pending.comparisonCode),
                  ...(t.diagnosis ? { diagnosis: t.diagnosis } : {}),
                },
              ]
            : [],
      ),
      // AX-9: a session whose page reloaded, waiting for its player's Reconnect.
      ...this.reloading(principal),
    ];
    // AX-12 (additive, AX.R8): the last ended session's diagnosis, while it is fresh, with what to do next.
    const kept = this.diagnoses.get(principal);
    const recent = kept && this.now() - kept.at <= DIAGNOSIS_KEEP_MS ? kept.diagnosis : undefined;
    return {
      version: 1,
      sessions,
      ...(recent ? { diagnosis: recent, next: nextDiagnosed(recent) } : {}),
    };
  }
  /** AX-12: keep `principal`'s latest diagnosis, the oldest dropped past the bound. */
  private remember(principal: string, diagnosis: Diagnosis) {
    this.diagnoses.delete(principal);
    this.diagnoses.set(principal, { diagnosis, at: this.now() });
    for (const key of this.diagnoses.keys()) {
      if (this.diagnoses.size <= DIAGNOSIS_KEEP_MAX) break;
      this.diagnoses.delete(key);
    }
  }
  /** AX-9: the caller's sessions waiting for their reloaded page, as `status` lists them. */
  private reloading(principal: string) {
    const now = this.now();
    const held = [...this.resumables.values()].filter((r) => r.principal === principal && now <= r.expiresAt);
    return held.map((r) => ({
      sessionId: r.sessionId,
      permissions: r.permissions,
      state: "reloading" as const,
      next: NEXT_RELOADING,
    }));
  }
  /**
   * AX-3 (C2, a browser adaptation): a request's absent `requestId` generated (`gw-` + random) and its absent
   * `sessionId`, `targetId` and `epoch` filled from the caller's one paired session that matches the fields given; none:
   * NOT_PAIRED, several: SESSION_AMBIGUOUS listing them. A given field is never changed, so it still has to match.
   */
  private implicit(principal: string, value: unknown): { value: unknown } | { refusal: AgentResult } {
    if (!value || typeof value !== "object" || Array.isArray(value)) return { value };
    const v = { ...(value as Record<string, unknown>) };
    if (v.requestId === undefined) v.requestId = "gw-" + this.random();
    if (v.sessionId !== undefined && v.targetId !== undefined && v.epoch !== undefined) return { value: v };
    this.sweep();
    const requestId = identifier(v.requestId) ? v.requestId : "invalid";
    const mine = [...this.targets.values()].filter(
      (t) =>
        t.session &&
        !t.session.revoked &&
        t.session.principal === principal &&
        (v.sessionId === undefined || v.sessionId === t.session.id) &&
        (v.targetId === undefined || v.targetId === t.id),
    );
    if (mine.length === 0)
      return {
        refusal: refused(requestId, this.resumableFor(principal, v.sessionId) ? "PAGE_RELOADING" : "NOT_PAIRED"),
      };
    if (mine.length > 1)
      return {
        refusal: {
          ...refused(requestId, "SESSION_AMBIGUOUS"),
          data: { sessions: this.status(principal).sessions.filter((s) => s.state === "paired") },
        },
      };
    const t = mine[0]!;
    v.sessionId ??= t.session!.id;
    v.targetId ??= t.id;
    v.epoch ??= t.epoch;
    return { value: v };
  }
  /** AX-3 (C3): an authority refusal with what to do next -- the permission missing, or the surface the page is on. */
  private authorityRefusal(r: AgentRequest, t: Target, code: string): AgentResult {
    const o = this.operations[r.operation];
    if (code === "PERMISSION_DENIED" && o)
      return {
        ...refused(r.requestId, code),
        hint: `This session lacks the "${o.permission}" permission ${r.operation} needs: agent_disconnect, then ask the player for a fresh join link and call agent_pair with it, allowing ${o.permission}.`,
        retry: { operation: r.operation, permissions: [o.permission] },
      };
    if (code === "SURFACE_DENIED") {
      const there = Object.entries(this.operations)
        .filter(([, op]) => op.surfaces.includes(t.surface))
        .map(([name]) => name);
      return {
        ...refused(r.requestId, code),
        hint: `The page is on ${t.surface}, where ${r.operation} does not run; operations that work there: ${there.join(", ")}. Ask the player to switch the page for the others.`,
        retry: { operation: r.operation, surface: t.surface },
      };
    }
    return refused(r.requestId, code);
  }
  /**
   * AX-14 (a browser adaptation): the session's undelivered notes, delivered -- removed from its queue, and the page told
   * `note-delivered` with their ids. None, or a session no longer live: an empty list and nothing sent.
   */
  private deliverNotes(t: Target, s: Session): AgentNote[] {
    if (s.revoked || t.session !== s || !s.notes.length) return [];
    const notes = s.notes.splice(0);
    t.send?.({
      type: "note-delivered",
      sessionId: s.id,
      targetId: t.id,
      epoch: t.epoch,
      noteIds: notes.map((n) => n.id),
    });
    return notes.map(({ text, at }) => ({ text, at }));
  }
  /**
   * AX-14: `agent_notes {sessionId?}` -- the caller's paired session (the one given, or the only one: none NOT_PAIRED,
   * several SESSION_AMBIGUOUS), its undelivered notes returned and delivered.
   */
  notes(principal: string, sessionId?: unknown) {
    this.sweep();
    if (sessionId !== undefined && typeof sessionId !== "string") throw Error("INVALID_SESSION");
    const mine = [...this.targets.values()].filter(
      (t) =>
        t.session &&
        !t.session.revoked &&
        t.session.principal === principal &&
        (sessionId === undefined || t.session.id === sessionId),
    );
    if (mine.length === 0) throw Error("NOT_PAIRED");
    if (mine.length > 1) throw Error("SESSION_AMBIGUOUS");
    const t = mine[0]!,
      s = t.session!;
    return { sessionId: s.id, targetId: t.id, notes: this.deliverNotes(t, s) };
  }
  /** AX-14: every result for a live session carries its undelivered notes, which it delivers. */
  private withNotes(t: Target, s: Session, result: AgentResult): AgentResult {
    const notes = this.deliverNotes(t, s);
    return notes.length ? { ...result, notes } : result;
  }
  async command(principal: string, input: unknown): Promise<AgentResult> {
    const filled = this.implicit(principal, input);
    if ("refusal" in filled) return filled.refusal;
    const value = filled.value;
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
      return refused(r.requestId, this.resumableFor(principal, r.sessionId) ? "PAGE_RELOADING" : "NOT_PAIRED");
    return this.withNotes(t, s, await this.forward(r, t, s));
  }
  /** The bound request, authorized, rate-limited, queued and sent to the page (AX-14 split it out of `command`). */
  private async forward(r: AgentRequest, t: Target, s: Session): Promise<AgentResult> {
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
    if (error) return this.authorityRefusal(r, t, error);
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
            ? teach({
                requestId: r.requestId,
                revision: 0,
                outcome: "unknown",
                code: "REQUEST_TIMEOUT",
              })
            : refused(r.requestId, "QUEUE_TIMEOUT"),
        );
      }, LIMITS.requestMs);
    });
    let abort!: (code?: string) => void;
    const revoked = new Promise<AgentResult>((resolve) => {
      abort = (code = "REVOKED") => {
        timedOut = true;
        resolve(
          teach({
            requestId: r.requestId,
            revision: 0,
            outcome: forwarded ? "unknown" : "refused",
            code,
          }),
        );
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
        if (liveError) return this.authorityRefusal(r, t, liveError);
        forwarded = true;
        return s.peer.request(r);
      })
      .catch(() =>
        teach({
          requestId: r.requestId,
          revision: 0,
          outcome: "unknown" as const,
          code: "CONNECTION_LOST",
        }),
      )
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
  /**
   * The caller's session ended by the agent. REVIEW-1 17 (C2): `sessionId` defaults to the caller's one session --
   * paired, pending or held for a reload; none: NOT_PAIRED, several: SESSION_AMBIGUOUS.
   */
  async disconnect(principal: string, sessionId?: unknown) {
    this.sweep();
    if (sessionId === undefined) {
      const now = this.now();
      const mine = [
        ...[...this.targets.values()].flatMap((t) => {
          const owned = t.session && !t.session.revoked && t.session.principal === principal ? t.session.id
            : t.pending?.principal === principal ? t.pending.sessionId : undefined;
          return owned === undefined ? [] : [owned];
        }),
        ...[...this.resumables.values()].filter((r) => r.principal === principal && now <= r.expiresAt).map((r) => r.sessionId),
      ];
      if (mine.length === 0) throw Error("NOT_PAIRED");
      if (mine.length > 1) throw Error("SESSION_AMBIGUOUS");
      sessionId = mine[0]!;
    }
    if (typeof sessionId !== "string") throw Error("INVALID_SESSION");
    // AX-9: a grant waiting for its reloaded page is discarded.
    const held = this.resumables.get(sessionId);
    if (held && held.principal === principal && this.now() <= held.expiresAt) {
      this.resumables.delete(sessionId);
      return { disconnected: true, sessionId };
    }
    const t = [...this.targets.values()].find(
      (t) =>
        (t.session?.id === sessionId && t.session.principal === principal) ||
        (t.pending?.sessionId === sessionId &&
          t.pending.principal === principal),
    );
    if (!t) throw Error("NOT_PAIRED");
    this.revoke(t, "AGENT_DISCONNECTED");
    this.targets.delete(t.id);
    return { disconnected: true, sessionId };
  }
  revokePrincipal(principal: string) {
    for (const [id, r] of this.resumables) if (r.principal === principal) this.resumables.delete(id);
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
    // AX-12: the session's principal keeps the page's diagnosis -- or, when the gateway's own transport to the page
    // failed (rtc.ts RTC_*), a failed route -- and the ended target remembers whose it was for a late page report.
    const principal = (t.session ?? t.pending)?.principal;
    if (principal !== undefined) {
      const d: Diagnosis | undefined = t.diagnosis ?? (reason.startsWith("RTC_") ? { class: "route-failed" } : undefined);
      if (d) this.remember(principal, d);
      const now = this.now();
      this.ended.delete(t.id);
      this.ended.set(t.id, { principal, at: now });
      for (const [key, e] of this.ended) {
        if (this.ended.size <= DIAGNOSIS_KEEP_MAX && now - e.at <= DIAGNOSIS_KEEP_MS) break;
        this.ended.delete(key);
      }
    }
    t.diagnosis = undefined;
    if (t.pending) {
      const outcome: PairOutcome = {
        state: "declined",
        sessionId: t.pending.sessionId,
        targetId: t.id,
        code: reason,
        hint: REFUSAL_HINTS[reason] ?? REFUSAL_HINTS.REFUSED!,
        next: "the page did not approve: ask the player whether to connect, and if so for a fresh join link",
      };
      // REVIEW-1 20, REVIEW-2 21: kept, bounded, for an agent_wait that comes after the decline -- always, since a waiter
      // still attached may be one its client already abandoned (its own tool timeout), and the guidance then says agent_wait.
      this.rememberEndedPending(t.pending.principal, outcome);
      this.settle(t.pending.sessionId, outcome);
    }
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
  private rememberEndedPending(principal: string, outcome: PairOutcome) {
    const now = this.now();
    this.endedPending.delete(outcome.sessionId);
    this.endedPending.set(outcome.sessionId, { principal, outcome, at: now });
    for (const [id, e] of this.endedPending) {
      if (this.endedPending.size <= ENDED_PENDING_KEEP_MAX && now - e.at <= ENDED_PENDING_KEEP_MS) break;
      this.endedPending.delete(id);
    }
  }
  sweep() {
    const now = this.now();
    for (const [id, e] of this.endedPending) {
      if (now - e.at <= ENDED_PENDING_KEEP_MS) break;
      this.endedPending.delete(id);
    }
    // AX-9: a lapsed grant's hash is kept one more window, so its late Reconnect is told RESUME_EXPIRED, not refused.
    for (const [id, r] of this.resumables) if (now > r.expiresAt + RESUME_LIMITS.resumeMs) this.resumables.delete(id);
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
    this.resumables.clear();
    this.endedPending.clear();
    // REVIEW-1 20: a waiter the revokes above did not reach is answered too, never dropped unresolved.
    for (const [id, w] of this.waiters) {
      clearTimeout(w.timer);
      this.waiters.delete(id);
      w.resolve({
        state: "declined",
        sessionId: id,
        targetId: "",
        code: "GATEWAY_SHUTDOWN",
        hint: REFUSAL_HINTS.GATEWAY_SHUTDOWN!,
        next: "the gateway stopped: sign in again if asked, then pair with a fresh join link",
      });
    }
    await Promise.allSettled(peers.map((p) => p.close()));
  }
}
