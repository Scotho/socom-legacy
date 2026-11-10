import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { PERMISSIONS, REFUSAL_HINTS, type AgentRequest, type SignalToPage } from "@s2u/forge-agent-protocol";
import { GatewayState, parseInvitation, type PagePeer } from "../src/sessions.js";
import { createMcpServer } from "../src/mcp.js";

// AX-3 (C2 implicit session, C3 refusals that teach, C4 pairing that waits; a browser adaptation).
const ORIGIN = "http://localhost:5361";
function rig() {
  const seen: AgentRequest[] = [];
  let n = 0;
  const state = new GatewayState({
    origins: [ORIGIN],
    random: () => `rnd${++n}`.padEnd(22, "x"),
    peerFactory: () =>
      ({
        offer: async () => "",
        answer: async () => {},
        ice: async () => {},
        close: async () => {},
        request: async (r) => {
          seen.push(r);
          return { requestId: r.requestId, revision: 3, outcome: "ok" };
        },
      }) satisfies PagePeer,
  });
  const page = (surface: "forge-editor" | "testroom-solo" = "forge-editor") => {
    const p = state.register(ORIGIN, { surface, name: "Forge", build: "test" });
    const sent: SignalToPage[] = [];
    state.attach(ORIGIN, p.pageToken, (m) => sent.push(m));
    return { ...p, sent };
  };
  const paired = async (principal = "a", permissions = ["inspect"]) => {
    const p = page();
    const pair = state.pair(principal, p.invitation, permissions, "agent");
    await state.signal(p.targetId, { type: "approve", pendingId: pair.pendingId, permissions });
    return { ...p, pair };
  };
  return { state, page, paired, seen };
}
afterEach(() => {
  vi.useRealTimers();
});
describe("C2 implicit session", () => {
  it("refuses NOT_PAIRED with a hint when the caller has no paired session", async () => {
    const { state } = rig();
    const r = await state.command("a", { version: 1, operation: "target.status", args: {} });
    expect(r).toMatchObject({ outcome: "refused", code: "NOT_PAIRED", hint: REFUSAL_HINTS.NOT_PAIRED });
    expect(r.requestId).toMatch(/^gw-/);
    await state.close();
  });
  it("fills sessionId, targetId, epoch and requestId from the one paired session", async () => {
    const { state, paired, seen } = rig();
    const p = await paired();
    const r = await state.command("a", { version: 1, operation: "target.status", args: {} });
    expect(r.outcome).toBe("ok");
    expect(r.requestId).toMatch(/^gw-/);
    expect(seen[0]).toMatchObject({ sessionId: p.pair.sessionId, targetId: p.targetId, epoch: p.pair.epoch, requestId: r.requestId });
    // Another principal's session is never borrowed.
    expect((await state.command("b", { version: 1, operation: "target.status", args: {} })).code).toBe("NOT_PAIRED");
    await state.close();
  });
  it("still refuses a given field that does not match exactly", async () => {
    const { state, paired } = rig();
    await paired();
    expect((await state.command("a", { version: 1, epoch: "wrong", operation: "target.status", args: {} })).code).toBe(
      "STALE_EPOCH",
    );
    expect((await state.command("a", { version: 1, sessionId: "other", operation: "target.status", args: {} })).code).toBe(
      "NOT_PAIRED",
    );
    await state.close();
  });
  it("refuses SESSION_AMBIGUOUS listing both sessions when the caller has two", async () => {
    const { state, paired } = rig();
    const one = await paired(),
      two = await paired();
    const r = await state.command("a", { version: 1, operation: "target.status", args: {} });
    expect(r).toMatchObject({ outcome: "refused", code: "SESSION_AMBIGUOUS", hint: REFUSAL_HINTS.SESSION_AMBIGUOUS });
    const sessions = (r.data as { sessions: { sessionId: string }[] }).sessions.map((s) => s.sessionId);
    expect(sessions.sort()).toEqual([one.pair.sessionId, two.pair.sessionId].sort());
    // Naming one of them resolves the rest.
    expect((await state.command("a", { version: 1, targetId: two.targetId, operation: "target.status", args: {} })).outcome).toBe("ok");
    await state.close();
  });
  it("forwards expectedRevision current to the page untouched", async () => {
    const { state, paired, seen } = rig();
    await paired("a", ["edit"]);
    const r = await state.command("a", { version: 1, operation: "forge.undo", expectedRevision: "current", args: {} });
    expect(r.outcome).toBe("ok");
    expect(seen[0]!.expectedRevision).toBe("current");
    await state.close();
  });
});
describe("C3 refusals that teach", () => {
  it("names the missing permission and the surface the page is on", async () => {
    const { state, paired } = rig();
    await paired("a", ["inspect"]);
    const denied = await state.command("a", { version: 1, operation: "forge.undo", expectedRevision: 1, args: {} });
    expect(denied).toMatchObject({ code: "PERMISSION_DENIED", retry: { permissions: ["edit"], operation: "forge.undo" } });
    expect(denied.hint).toContain("edit");
    const surface = await state.command("a", { version: 1, operation: "testroom.read", args: {} });
    expect(surface).toMatchObject({ code: "SURFACE_DENIED", retry: { surface: "forge-editor" } });
    expect(surface.hint).toContain("forge-editor");
    expect(surface.hint).toContain("forge.read");
    await state.close();
  });
  it("teaches a parse refusal", async () => {
    const { state, paired } = rig();
    await paired();
    const r = await state.command("a", { version: 1, operation: "nope", args: {} });
    expect(r).toMatchObject({ code: "UNKNOWN_OPERATION", hint: REFUSAL_HINTS.UNKNOWN_OPERATION });
    await state.close();
  });
  it("has a hint for every code the gateway's sources emit", () => {
    const codes = new Set<string>();
    for (const file of ["sessions.ts", "gateway.ts", "mcp.ts", "rtc.ts"]) {
      const text = readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
      // A refusal's code, a thrown code a route answers, a JSON code and a revocation reason.
      for (const m of text.matchAll(
        /(?:refused\([^,()]+,\s*|code:\s*|revoke\(t,\s*|transportLost\(|lost\()"([A-Z][A-Z_]{2,})"/g,
      ))
        codes.add(m[1]!);
      if (file !== "gateway.ts")
        for (const m of text.matchAll(/Error\("([A-Z][A-Z_]{2,})"\)/g)) codes.add(m[1]!);
    }
    expect(codes.size).toBeGreaterThan(30);
    expect([...codes].filter((c) => !REFUSAL_HINTS[c])).toEqual([]);
  });
});
describe("C4 pairing that waits", () => {
  it("parses a raw invitation or a join link, strictly", () => {
    expect(parseInvitation("abcDEF123_-xyzABC12345")).toBe("abcDEF123_-xyzABC12345");
    expect(parseInvitation("https://agent.example.org/join/abcDEF123_-xyzABC12345")).toBe("abcDEF123_-xyzABC12345");
    expect(parseInvitation("http://127.0.0.1:5370/join/abc")).toBe("abc");
    for (const bad of [
      "https://agent.example.org/join/",
      "https://agent.example.org/other/abc",
      "https://agent.example.org/join/abc/extra",
      "https://agent.example.org/join/abc?x=1",
      "https://agent.example.org/join/a%20b",
      "ftp://agent.example.org/join/abc",
      `https://agent.example.org/join/${"a".repeat(129)}`,
      "",
      "x".repeat(129),
    ])
      expect(() => parseInvitation(bad), bad).toThrow("INVALID_INVITATION");
  });
  it("defaults permissions to all six and the client name, and resolves paired on approve", async () => {
    vi.useFakeTimers();
    const { state, page } = rig();
    const p = page();
    const wait = state.pairAndWait("a", `http://127.0.0.1:5370/join/${p.invitation}`, undefined, undefined, 60);
    const pending = p.sent.find((m) => m.type === "pending") as Extract<SignalToPage, { type: "pending" }>;
    expect(pending).toMatchObject({ clientName: "MCP client", permissions: [...PERMISSIONS] });
    expect(state.waiting).toBe(1);
    await state.signal(p.targetId, { type: "approve", pendingId: pending.pendingId, permissions: ["inspect", "edit"] });
    const r = await wait;
    expect(r).toMatchObject({ state: "paired", targetId: p.targetId, permissions: ["inspect", "edit"] });
    expect(r.sessionId).toBeTruthy();
    expect(r.epoch).toBeTruthy();
    expect(state.waiting).toBe(0);
    await state.close();
  });
  it("resolves declined when the page declines", async () => {
    vi.useFakeTimers();
    const { state, page } = rig();
    const p = page();
    const wait = state.pairAndWait("a", p.invitation, ["inspect"], "agent", 60);
    await state.signal(p.targetId, { type: "revoke" });
    expect(await wait).toMatchObject({ state: "declined", code: "PAGE_REVOKED" });
    expect(state.waiting).toBe(0);
    await state.close();
  });
  it("resolves pending with how to wait when the wait ends, and the waiter is cleared", async () => {
    vi.useFakeTimers();
    const { state, page } = rig();
    const p = page();
    const wait = state.pairAndWait("a", p.invitation, ["inspect"], "agent", 5);
    await vi.advanceTimersByTimeAsync(5000);
    const r = await wait;
    expect(r).toMatchObject({ state: "pending", targetId: p.targetId });
    expect(String(r.next)).toContain("agent_wait");
    expect(state.waiting).toBe(0);
    // A later wait on the same session resolves on approve.
    const again = state.wait("a", String(r.sessionId), 60);
    expect(state.waiting).toBe(1);
    const second = state.wait("a", String(r.sessionId), 60);
    expect(state.waiting).toBe(1);
    expect(await again).toMatchObject({ state: "pending" });
    const pending = p.sent.find((m) => m.type === "pending") as Extract<SignalToPage, { type: "pending" }>;
    await state.signal(p.targetId, { type: "approve", pendingId: pending.pendingId, permissions: ["inspect"] });
    expect(await second).toMatchObject({ state: "paired" });
    expect(state.waiting).toBe(0);
    await state.close();
  });
  // REVIEW-1 13: 45 s by default and 90 s at most, under the clients' tool timeouts and an edge tunnel's response limit.
  it("clamps waitSeconds to 0..90 and clears waiters on close", async () => {
    vi.useFakeTimers();
    const { state, page } = rig();
    const p = page();
    expect(await state.pairAndWait("a", p.invitation, ["inspect"], "agent", 0)).toMatchObject({ state: "pending" });
    expect(state.waiting).toBe(0);
    const q = page();
    const long = state.pairAndWait("a", q.invitation, ["inspect"], "agent", 9999);
    await vi.advanceTimersByTimeAsync(89_000);
    expect(state.waiting).toBe(1);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await long).toMatchObject({ state: "pending" });
    const z = page();
    const closing = state.pairAndWait("a", z.invitation, ["inspect"], "agent", 60);
    await state.close();
    expect(await closing).toMatchObject({ state: "declined", code: "GATEWAY_SHUTDOWN" });
    expect(state.waiting).toBe(0);
  });
  it("REVIEW-1 20: a decline with no waiter attached is answered declined by a later agent_wait", async () => {
    vi.useFakeTimers();
    const { state, page } = rig();
    const p = page();
    const first = await state.pairAndWait("a", p.invitation, ["inspect"], "agent", 0);
    expect(first).toMatchObject({ state: "pending" });
    expect(state.waiting).toBe(0);
    await state.signal(p.targetId, { type: "revoke" });
    expect(await state.wait("a", first.sessionId, 5)).toMatchObject({ state: "declined", code: "PAGE_REVOKED", sessionId: first.sessionId });
    // Only the caller's own: another principal still reads NOT_PAIRED.
    await expect(state.wait("b", first.sessionId, 5)).rejects.toThrow("NOT_PAIRED");
    await state.close();
  });
  // REVIEW-2 21: the client gave up on agent_pair (its own tool timeout) while the gateway still holds the waiter; the
  // decline goes to that abandoned waiter, and the agent_wait the guidance recommends must still answer declined.
  it("REVIEW-2 21: a decline that lands on an abandoned agent_pair waiter is answered declined by a later agent_wait", async () => {
    vi.useFakeTimers();
    const { state, page } = rig();
    const p = page();
    const pair = state.pair("a", p.invitation, ["inspect"], "agent");
    const abandoned = state.wait("a", pair.sessionId, 60);
    expect(state.waiting).toBe(1);
    await state.signal(p.targetId, { type: "revoke" });
    expect(await abandoned).toMatchObject({ state: "declined", code: "PAGE_REVOKED" });
    expect(await state.wait("a", pair.sessionId, 5)).toMatchObject({ state: "declined", code: "PAGE_REVOKED", sessionId: pair.sessionId });
    await expect(state.wait("b", pair.sessionId, 5)).rejects.toThrow("NOT_PAIRED");
    await state.close();
  });
  it("REVIEW-1 20: close() resolves every waiter declined, GATEWAY_SHUTDOWN", async () => {
    vi.useFakeTimers();
    const { state, page } = rig();
    const waits = [page(), page()].map((p) => state.pairAndWait("a", p.invitation, ["inspect"], "agent", 60));
    await state.close();
    for (const w of waits) expect(await w).toMatchObject({ state: "declined", code: "GATEWAY_SHUTDOWN" });
    expect(state.waiting).toBe(0);
  });
  it("status says the next step for each session", async () => {
    const { state, page, paired } = rig();
    await paired();
    const p = page();
    state.pair("a", p.invitation, ["inspect"], "agent");
    const sessions = state.status("a").sessions as { state: string; next: string }[];
    expect(sessions.find((s) => s.state === "paired")!.next).toContain("agent_capabilities");
    expect(sessions.find((s) => s.state === "pending")!.next).toContain("Allow");
    await state.close();
  });
  it("MCP agent_pair takes a join link alone and waits; agent_request needs no session fields", async () => {
    const { state, page } = rig();
    const p = page();
    const server = createMcpServer(state, "a", "http://127.0.0.1:5370"),
      client = new Client({ name: "test", version: "1" });
    const [x, y] = InMemoryTransport.createLinkedPair();
    await server.connect(x);
    await client.connect(y);
    try {
      const call = client.callTool({ name: "agent_pair", arguments: { invitation: `http://127.0.0.1:5370/join/${p.invitation}`, waitSeconds: 5 } });
      await vi.waitFor(() => expect(p.sent.some((m) => m.type === "pending")).toBe(true));
      const pending = p.sent.find((m) => m.type === "pending") as Extract<SignalToPage, { type: "pending" }>;
      await state.signal(p.targetId, { type: "approve", pendingId: pending.pendingId, permissions: ["inspect"] });
      expect((await call).structuredContent).toMatchObject({ state: "paired", permissions: ["inspect"] });
      const r = await client.callTool({ name: "agent_request", arguments: { operation: "target.status", args: {} } });
      expect(r.structuredContent).toMatchObject({ outcome: "ok" });
      const bad = await client.callTool({ name: "agent_pair", arguments: { invitation: "https://x.example/other/abc" } });
      expect(bad.structuredContent).toMatchObject({ code: "INVALID_INVITATION", hint: REFUSAL_HINTS.INVALID_INVITATION });
    } finally {
      await client.close();
      await server.close();
      await state.close();
    }
  });
});

// REVIEW-1 13, 17: the agent tools' contracts.
describe("REVIEW-1: agent_pair's timeout words, agent_notes, agent_disconnect", () => {
  async function mcp() {
    const r = rig();
    const server = createMcpServer(r.state, "a", "http://127.0.0.1:5370"),
      client = new Client({ name: "test", version: "1" });
    const [x, y] = InMemoryTransport.createLinkedPair();
    await server.connect(x);
    await client.connect(y);
    const close = async () => { await client.close(); await server.close(); await r.state.close(); };
    return { ...r, client, close };
  }
  it("13: agent_pair's and agent_wait's descriptions say a client timeout means agent_wait", async () => {
    const { client, close } = await mcp();
    try {
      const { tools } = await client.listTools();
      expect(tools.find((t) => t.name === "agent_pair")!.description).toMatch(/times out[^.]*agent_wait/);
      expect(JSON.stringify(tools.find((t) => t.name === "agent_pair")!.inputSchema)).toContain('"maximum":90');
    } finally { await close(); }
  });
  it("17: agent_notes is not read-only (it marks notes delivered)", async () => {
    const { client, close } = await mcp();
    try {
      const { tools } = await client.listTools();
      expect(tools.find((t) => t.name === "agent_notes")!.annotations?.readOnlyHint).toBe(false);
    } finally { await close(); }
  });
  it("17: agent_disconnect defaults to the caller's one session and refuses with refusal() (code and hint)", async () => {
    const { client, close, paired, state } = await mcp();
    try {
      const none = await client.callTool({ name: "agent_disconnect", arguments: {} });
      expect(none.isError).toBe(true);
      expect(none.structuredContent).toEqual({ code: "NOT_PAIRED", hint: REFUSAL_HINTS.NOT_PAIRED });
      const one = await paired("a");
      const done = await client.callTool({ name: "agent_disconnect", arguments: {} });
      expect(done.isError).toBeFalsy();
      expect(done.structuredContent).toMatchObject({ disconnected: true, sessionId: one.pair.sessionId });
      expect(state.status("a").sessions).toEqual([]);
      await paired("a");
      await paired("a");
      const two = await client.callTool({ name: "agent_disconnect", arguments: {} });
      expect(two.isError).toBe(true);
      expect(two.structuredContent).toMatchObject({ code: "SESSION_AMBIGUOUS", hint: REFUSAL_HINTS.SESSION_AMBIGUOUS });
      expect((two.structuredContent as { data: { sessions: unknown[] } }).data.sessions).toHaveLength(2);
      const wrong = await client.callTool({ name: "agent_disconnect", arguments: { sessionId: "nope" } });
      expect(wrong.structuredContent).toEqual({ code: "NOT_PAIRED", hint: REFUSAL_HINTS.NOT_PAIRED });
    } finally { await close(); }
  });
});
