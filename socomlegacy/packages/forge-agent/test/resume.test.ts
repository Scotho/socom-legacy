import { describe, expect, it } from "vitest";
import WebSocket from "ws";
import { REFUSAL_HINTS, RESUME_LIMITS, type AgentRequest, type SignalToPage } from "@s2u/forge-agent-protocol";
import { GatewayState, type PagePeer } from "../src/sessions.js";
import { createGateway } from "../src/gateway.js";
import { freePort } from "./ports.js";

// AX-9 (a browser adaptation, product track): a paired page that leaves by pagehide keeps its grant resumable for
// RESUME_LIMITS.resumeMs, bound to a one-time ticket the page held; the reloaded page re-binds with one click.
const ORIGIN = "http://localhost:5361";
const OTHER = "http://localhost:5362";
type Ticket = Extract<SignalToPage, { type: "resume-ticket" }>;
function rig(caps: { maxSessions?: number; maxSessionsPerAddress?: number; maxResumables?: number } = {}) {
  const seen: AgentRequest[] = [];
  let n = 0,
    clock = 1_000_000;
  const peers: { closed: boolean }[] = [];
  const config = { ...caps };
  const state = new GatewayState({
    get maxSessions() { return config.maxSessions; },
    get maxSessionsPerAddress() { return config.maxSessionsPerAddress; },
    get maxResumables() { return config.maxResumables; },
    origins: [ORIGIN, OTHER],
    now: () => clock,
    random: () => `rnd${++n}`.padEnd(22, "x"),
    peerFactory: () => {
      const mark = { closed: false };
      peers.push(mark);
      return {
        offer: async () => "offer",
        answer: async () => {},
        ice: async () => {},
        close: async () => {
          mark.closed = true;
        },
        request: async (r) => {
          seen.push(r);
          return { requestId: r.requestId, revision: 3, outcome: "ok" };
        },
      } satisfies PagePeer;
    },
  });
  const page = (origin = ORIGIN, surface: "forge-editor" | "testroom-solo" = "forge-editor") => {
    const p = state.register(origin, { surface, name: "Forge", build: "test" });
    const sent: SignalToPage[] = [];
    const attached = state.attach(origin, p.pageToken, (m) => sent.push(m));
    return { ...p, sent, detach: attached.detach };
  };
  const paired = async (principal = "a", permissions = ["inspect", "edit"], address?: string) => {
    const p = page();
    const pair = state.pair(principal, p.invitation, permissions, "Claude Code", address);
    await state.signal(p.targetId, { type: "approve", pendingId: pair.pendingId, permissions });
    const ticket = p.sent.find((m): m is Ticket => m.type === "resume-ticket");
    return { ...p, pair, ticket };
  };
  const status = { version: 1, operation: "target.status", args: {} };
  return {
    state,
    config,
    page,
    paired,
    seen,
    peers,
    status,
    advance: (ms: number) => (clock += ms),
  };
}
describe("AX-9 the resume ticket", () => {
  it("is issued to the paired page as a resume-ticket message, after the offer", async () => {
    const { state, paired } = rig();
    const p = await paired();
    expect(p.ticket).toMatchObject({ type: "resume-ticket", sessionId: p.pair.sessionId, clientName: "Claude Code" });
    expect(typeof p.ticket!.ticket).toBe("string");
    expect(p.sent.findIndex((m) => m.type === "offer")).toBeLessThan(p.sent.findIndex((m) => m.type === "resume-ticket"));
    await state.close();
  });
  it("is held hashed, never as itself", async () => {
    const { state, paired } = rig();
    const p = await paired();
    await state.signal(p.targetId, { type: "pagehide" });
    const held = JSON.stringify([...(state as unknown as { resumables: Map<string, unknown> }).resumables.values()]);
    expect(held).not.toContain(p.ticket!.ticket);
    expect(held.length).toBeGreaterThan(0);
    await state.close();
  });
  it("the window is a labelled browser-adaptation constant of 120 s", () => {
    expect(RESUME_LIMITS.resumeMs).toBe(120_000);
    expect(Object.isFrozen(RESUME_LIMITS)).toBe(true);
  });
});
describe("AX-9 reload within the window, then Reconnect", () => {
  it("AX-14 x AX-9: a note sent before the reload and not yet delivered rides the first result after Reconnect", async () => {
    const { state, paired, page, status } = rig();
    const p = await paired();
    await state.signal(p.targetId, { type: "note", sessionId: p.pair.sessionId, targetId: p.targetId, epoch: p.pair.epoch, text: "try the left door" });
    await state.signal(p.targetId, { type: "pagehide" });
    const q = page();
    await state.signal(q.targetId, { type: "resume", ticket: p.ticket!.ticket });
    expect(state.status("a").sessions[0]).toMatchObject({ state: "paired", notes: [{ text: "try the left door" }] });
    const r = await state.command("a", status);
    expect(r.notes?.map((x) => x.text)).toEqual(["try the left door"]);
    expect((await state.command("a", status)).notes).toBeUndefined();
    await state.close();
  });
  it("re-binds the same sessionId, principal and grants to the new page with a new epoch and peer", async () => {
    const { state, paired, page, seen, peers, status, advance } = rig();
    const p = await paired();
    await state.signal(p.targetId, { type: "pagehide" });
    p.detach(); // the socket closes after the pagehide message
    expect(peers[0]!.closed).toBe(true);
    // During the window the agent is told to wait, and a command is refused PAGE_RELOADING with its hint.
    const during = state.status("a").sessions;
    expect(during).toEqual([
      expect.objectContaining({ sessionId: p.pair.sessionId, state: "reloading", next: expect.stringMatching(/waiting for the player to reconnect after a reload/) }),
    ]);
    const refused = await state.command("a", status);
    expect(refused).toMatchObject({ outcome: "refused", code: "PAGE_RELOADING", hint: REFUSAL_HINTS.PAGE_RELOADING });
    // An explicit binding to the old target is told the same.
    const explicit = await state.command("a", { ...status, requestId: "x", sessionId: p.pair.sessionId, targetId: p.targetId, epoch: p.pair.epoch });
    expect(explicit.code).toBe("PAGE_RELOADING");
    advance(RESUME_LIMITS.resumeMs - 1000);
    const q = page();
    await state.signal(q.targetId, { type: "resume", ticket: p.ticket!.ticket });
    const offer = q.sent.find((m) => m.type === "offer") as Extract<SignalToPage, { type: "offer" }>;
    expect(offer).toMatchObject({ sessionId: p.pair.sessionId, targetId: q.targetId, permissions: ["inspect", "edit"] });
    expect(offer.epoch).not.toBe(p.pair.epoch);
    expect(peers).toHaveLength(2);
    // A fresh ticket for the next reload.
    const next = q.sent.find((m): m is Ticket => m.type === "resume-ticket");
    expect(next?.sessionId).toBe(p.pair.sessionId);
    expect(next?.ticket).not.toBe(p.ticket!.ticket);
    // The agent's next request works through the implicit session.
    const ok = await state.command("a", status);
    expect(ok.outcome).toBe("ok");
    expect(seen.at(-1)).toMatchObject({ sessionId: p.pair.sessionId, targetId: q.targetId, epoch: offer.epoch });
    expect(state.status("a").sessions).toEqual([expect.objectContaining({ sessionId: p.pair.sessionId, state: "paired", permissions: ["inspect", "edit"] })]);
    // The new page's own invitation can no longer be spent on another pairing.
    expect(() => state.pair("b", q.invitation)).toThrow("INVITATION_EXPIRED");
    await state.close();
  });
  it("refuses after the window, and the agent no longer sees a reloading session", async () => {
    const { state, paired, page, advance } = rig();
    const p = await paired();
    await state.signal(p.targetId, { type: "pagehide" });
    advance(RESUME_LIMITS.resumeMs + 1);
    const q = page();
    await state.signal(q.targetId, { type: "resume", ticket: p.ticket!.ticket });
    expect(q.sent.at(-1)).toEqual({ type: "resume-refused", code: "RESUME_EXPIRED" });
    expect(q.sent.some((m) => m.type === "offer")).toBe(false);
    expect(state.status("a").sessions).toEqual([]);
    expect((await state.command("a", { version: 1, operation: "target.status", args: {} })).code).toBe("NOT_PAIRED");
    // The new page is left as an ordinary unpaired registration: it may still pair afresh.
    expect(state.pair("a", q.invitation).state).toBe("pending");
    await state.close();
  });
  it("refuses a ticket used twice", async () => {
    const { state, paired, page } = rig();
    const p = await paired();
    await state.signal(p.targetId, { type: "pagehide" });
    const q = page();
    await state.signal(q.targetId, { type: "resume", ticket: p.ticket!.ticket });
    expect(q.sent.some((m) => m.type === "offer")).toBe(true);
    // The resumed page reloads without a pagehide reaching the gateway (a crash): its socket drops.
    q.detach();
    const r = page();
    await state.signal(r.targetId, { type: "resume", ticket: p.ticket!.ticket });
    expect(r.sent.at(-1)).toEqual({ type: "resume-refused", code: "RESUME_REFUSED" });
    await state.close();
  });
  it("refuses a page of another origin, and spends the ticket", async () => {
    const { state, paired, page } = rig();
    const p = await paired();
    await state.signal(p.targetId, { type: "pagehide" });
    const other = page(OTHER);
    await state.signal(other.targetId, { type: "resume", ticket: p.ticket!.ticket });
    expect(other.sent.at(-1)).toEqual({ type: "resume-refused", code: "RESUME_REFUSED" });
    const q = page();
    await state.signal(q.targetId, { type: "resume", ticket: p.ticket!.ticket });
    expect(q.sent.at(-1)).toEqual({ type: "resume-refused", code: "RESUME_REFUSED" });
    await state.close();
  });
  it("refuses a wrong ticket, and a resume on a page already pending or paired", async () => {
    const { state, paired, page } = rig();
    const p = await paired();
    await state.signal(p.targetId, { type: "pagehide" });
    const q = page();
    await state.signal(q.targetId, { type: "resume", ticket: "not-the-ticket" });
    expect(q.sent.at(-1)).toEqual({ type: "resume-refused", code: "RESUME_REFUSED" });
    const busy = await paired("b");
    await state.signal(busy.targetId, { type: "resume", ticket: p.ticket!.ticket });
    expect(busy.sent.at(-1)).toEqual({ type: "resume-refused", code: "TARGET_BUSY" });
    // The busy refusal did not spend it.
    await state.signal(q.targetId, { type: "resume", ticket: p.ticket!.ticket });
    expect(q.sent.some((m) => m.type === "offer")).toBe(true);
    await state.close();
  });
});
describe("AX-9 what discards the resumable grant", () => {
  it("agent_disconnect during the window", async () => {
    const { state, paired, page } = rig();
    const p = await paired();
    await state.signal(p.targetId, { type: "pagehide" });
    expect(await state.disconnect("a", p.pair.sessionId)).toEqual({ disconnected: true, sessionId: p.pair.sessionId });
    expect(state.status("a").sessions).toEqual([]);
    const q = page();
    await state.signal(q.targetId, { type: "resume", ticket: p.ticket!.ticket });
    expect(q.sent.at(-1)).toEqual({ type: "resume-refused", code: "RESUME_REFUSED" });
    await state.close();
  });
  it("the principal's authorization revoked during the window", async () => {
    const { state, paired, page } = rig();
    const p = await paired();
    await state.signal(p.targetId, { type: "pagehide" });
    state.revokePrincipal("a");
    const q = page();
    await state.signal(q.targetId, { type: "resume", ticket: p.ticket!.ticket });
    expect(q.sent.at(-1)).toEqual({ type: "resume-refused", code: "RESUME_REFUSED" });
    await state.close();
  });
  it("the page's own Disconnect (revoke) keeps nothing resumable", async () => {
    const { state, paired, page } = rig();
    const p = await paired();
    await state.signal(p.targetId, { type: "revoke" });
    expect(state.status("a").sessions).toEqual([]);
    const q = page();
    await state.signal(q.targetId, { type: "resume", ticket: p.ticket!.ticket });
    expect(q.sent.at(-1)).toEqual({ type: "resume-refused", code: "RESUME_REFUSED" });
    await state.close();
  });
  it("a socket that drops without a pagehide keeps nothing resumable", async () => {
    const { state, paired, page } = rig();
    const p = await paired();
    p.detach();
    expect(state.status("a").sessions).toEqual([]);
    const q = page();
    await state.signal(q.targetId, { type: "resume", ticket: p.ticket!.ticket });
    expect(q.sent.at(-1)).toEqual({ type: "resume-refused", code: "RESUME_REFUSED" });
    await state.close();
  });
});
describe("AX-9 over the signaling socket", () => {
  it("a pagehide followed at once by the socket's close keeps the grant resumable", async () => {
    const port = await freePort();
    const g = createGateway({
      issuer: `http://127.0.0.1:${port}`,
      origins: [ORIGIN],
      development: true,
      peerFactory: () => ({
        offer: async () => "offer",
        answer: async () => {},
        ice: async () => {},
        request: async (r) => ({ requestId: r.requestId, revision: 0, outcome: "ok" }),
        close: async () => {},
      }),
    });
    await g.listen(port);
    const open = (token: string) =>
      new Promise<{ ws: WebSocket; got: Record<string, unknown>[] }>((resolve, reject) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/signal`, ["s2u-agent-v1", `auth.${token}`], { origin: ORIGIN });
        const got: Record<string, unknown>[] = [];
        ws.on("message", (d) => got.push(JSON.parse(d.toString())));
        ws.once("open", () => resolve({ ws, got }));
        ws.once("error", reject);
      });
    try {
      const p = g.state.register(ORIGIN, { surface: "forge-editor", name: "Forge", build: "test" });
      const a = await open(p.pageToken);
      const pair = g.state.pair("g", p.invitation, ["inspect"], "client");
      await expect.poll(() => a.got.some((m) => m.type === "pending")).toBe(true);
      a.ws.send(JSON.stringify({ type: "approve", pendingId: pair.pendingId, permissions: ["inspect"] }));
      await expect.poll(() => a.got.some((m) => m.type === "resume-ticket")).toBe(true);
      const ticket = a.got.find((m) => m.type === "resume-ticket")!.ticket as string;
      a.ws.send(JSON.stringify({ type: "pagehide" }));
      a.ws.close();
      await expect.poll(() => g.state.status("g").sessions[0]?.state).toBe("reloading");
      const q = g.state.register(ORIGIN, { surface: "forge-editor", name: "Forge", build: "test" });
      const b = await open(q.pageToken);
      b.ws.send(JSON.stringify({ type: "resume", ticket }));
      await expect.poll(() => b.got.some((m) => m.type === "offer")).toBe(true);
      expect(b.got.find((m) => m.type === "offer")).toMatchObject({ sessionId: pair.sessionId, targetId: q.targetId });
      b.ws.close();
    } finally {
      await g.close();
    }
  });
});

// REVIEW-1 6: a grant held for a reload is a session slot: pair() counts it, resume() checks the caps before it binds,
// and the held grants have a hard bound of their own.
describe("REVIEW-1 6: held grants and the session caps", () => {
  const held = (state: GatewayState) => (state as unknown as { resumables: Map<string, unknown> }).resumables;
  it("pair() counts a held grant toward maxSessions", async () => {
    const { state, paired, page } = rig({ maxSessions: 2 });
    const p = await paired("a");
    await state.signal(p.targetId, { type: "pagehide" });
    await paired("b");
    expect(() => state.pair("c", page().invitation, ["inspect"], "x", "elsewhere")).toThrow("CAPACITY");
    await state.close();
  });
  it("pair() counts a held grant toward maxSessionsPerAddress: pair, approve, pagehide cannot loop past the cap", async () => {
    const { state, paired, page } = rig({ maxSessionsPerAddress: 2 });
    for (let i = 0; i < 2; i++) {
      const p = await paired("a", ["inspect"], "address-1");
      await state.signal(p.targetId, { type: "pagehide" });
    }
    expect(held(state).size).toBe(2);
    expect(() => state.pair("a", page().invitation, ["inspect"], "x", "address-1")).toThrow("ADDRESS_CAPACITY");
    // Another address is untouched, and a lapsed grant no longer counts.
    expect(state.pair("b", page().invitation, ["inspect"], "x", "address-2").state).toBe("pending");
    await state.close();
  });
  it("a lapsed grant stops counting", async () => {
    const { state, paired, page, advance } = rig({ maxSessionsPerAddress: 1 });
    const p = await paired("a", ["inspect"], "address-1");
    await state.signal(p.targetId, { type: "pagehide" });
    expect(() => state.pair("a", page().invitation, ["inspect"], "x", "address-1")).toThrow("ADDRESS_CAPACITY");
    advance(RESUME_LIMITS.resumeMs + 1);
    expect(state.pair("a", page().invitation, ["inspect"], "x", "address-1").state).toBe("pending");
    await state.close();
  });
  it("resume() makes the CAPACITY and ADDRESS_CAPACITY checks before it binds", async () => {
    const { state, config, paired, page } = rig();
    const p = await paired("a", ["inspect"], "address-1");
    await state.signal(p.targetId, { type: "pagehide" });
    await paired("b", ["inspect"], "address-2");
    // The caps now sit below what is held (an operator's bound read live): the reconnect may not bind past them.
    config.maxSessions = 1;
    const q = page();
    await state.signal(q.targetId, { type: "resume", ticket: p.ticket!.ticket });
    expect(q.sent.at(-1)).toEqual({ type: "resume-refused", code: "CAPACITY" });
    expect(q.sent.some((m) => m.type === "offer")).toBe(false);
    config.maxSessions = undefined;
    const r = await paired("c", ["inspect"], "address-3");
    await state.signal(r.targetId, { type: "pagehide" });
    await paired("d", ["inspect"], "address-3");
    config.maxSessionsPerAddress = 1;
    const s = page();
    await state.signal(s.targetId, { type: "resume", ticket: r.ticket!.ticket });
    expect(s.sent.at(-1)).toEqual({ type: "resume-refused", code: "ADDRESS_CAPACITY" });
    expect(s.sent.some((m) => m.type === "offer")).toBe(false);
    await state.close();
  });
  it("the held grants have a hard size cap: past it a leaving page ends as a revoke, after lapsed ones make room", async () => {
    const { state, paired, advance } = rig({ maxResumables: 2 });
    const a = await paired("a");
    await state.signal(a.targetId, { type: "pagehide" });
    const b = await paired("b");
    await state.signal(b.targetId, { type: "pagehide" });
    const c = await paired("c");
    await state.signal(c.targetId, { type: "pagehide" });
    expect(held(state).size).toBe(2);
    expect(state.status("c").sessions).toEqual([]);
    // a's lapsed grant (kept a window for its RESUME_EXPIRED) gives way to a live one.
    advance(RESUME_LIMITS.resumeMs + 1);
    const d = await paired("d");
    await state.signal(d.targetId, { type: "pagehide" });
    expect(held(state).size).toBe(2);
    expect(state.status("d").sessions).toEqual([expect.objectContaining({ state: "reloading" })]);
    await state.close();
  });
});
