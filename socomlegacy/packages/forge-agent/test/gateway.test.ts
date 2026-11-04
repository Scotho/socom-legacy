import { describe, it, expect, vi } from "vitest";
import { GatewayState, type PagePeer } from "../src/sessions.js";
import { LIMITS } from "@s2u/forge-agent-protocol";
import { createGateway } from "../src/gateway.js";
import type { AddressInfo } from "node:net";
import { createHash } from "node:crypto";
import { freePort } from "./ports.js";
describe("page authority", () => {
  it("revokes the capability when its RTC peer reports transport loss", async () => {
    let lost!: (reason: string) => void,
      closed = false;
    const state = new GatewayState({
      origins: ["http://localhost:5361"],
      peerFactory: (_signal, onDisconnect) => {
        lost = onDisconnect;
        return {
          offer: async () => "",
          answer: async () => {},
          ice: async () => {},
          request: async (r) => ({
            requestId: r.requestId,
            revision: 0,
            outcome: "ok",
          }),
          close: async () => {
            closed = true;
          },
        };
      },
    });
    const p = state.register("http://localhost:5361", {
      surface: "forge-editor",
      name: "Forge",
      build: "test",
    });
    state.attach("http://localhost:5361", p.pageToken, () => {});
    const pair = state.pair("a", p.invitation, ["inspect"], "agent");
    await state.signal(p.targetId, {
      type: "approve",
      pendingId: pair.pendingId,
      permissions: ["inspect"],
    });
    lost("RTC_DISCONNECTED");
    expect(state.status("a").sessions).toEqual([]);
    expect(closed).toBe(true);
    await state.close();
  });
  it("forwards a lost-response retry to page receipts without rejecting its earlier revision", async () => {
    let edits = 0;
    let receipt:
      | {
          result: { requestId: string; revision: number; outcome: "ok" };
          args: string;
        }
      | undefined;
    const peer: PagePeer = {
      offer: async () => "",
      answer: async () => {},
      ice: async () => {},
      close: async () => {},
      request: async (r) => {
        if (receipt) {
          if (JSON.stringify(r.args) !== receipt.args)
            return {
              requestId: r.requestId,
              revision: edits,
              outcome: "refused",
              code: "REQUEST_ID_REUSED",
            };
          return receipt.result;
        }
        edits++;
        receipt = {
          result: { requestId: r.requestId, revision: edits, outcome: "ok" },
          args: JSON.stringify(r.args),
        };
        throw Error("response lost after commit");
      },
    };
    const s = new GatewayState({
      origins: ["http://localhost:5361"],
      peerFactory: () => peer,
    });
    try {
      const p = s.register("http://localhost:5361", {
        surface: "forge-editor",
        name: "Forge",
        build: "test",
      });
      s.attach("http://localhost:5361", p.pageToken, () => {});
      const pair = s.pair("a", p.invitation, ["edit"], "agent");
      await s.signal(p.targetId, {
        type: "approve",
        pendingId: pair.pendingId,
        permissions: ["edit"],
      });
      const r = {
        version: 1,
        requestId: "edit",
        sessionId: pair.sessionId,
        targetId: p.targetId,
        epoch: p.epoch,
        expectedRevision: 0,
        operation: "forge.edit",
        args: { action: "place" },
      };
      expect((await s.command("a", r)).outcome).toBe("unknown");
      expect(await s.command("a", r)).toMatchObject({
        outcome: "ok",
        revision: 1,
      });
      expect(edits).toBe(1);
      expect(
        (await s.command("a", { ...r, args: { action: "remove" } })).code,
      ).toBe("REQUEST_ID_REUSED");
    } finally {
      await s.close();
    }
  });
  it("revocation settles in-flight and queued requests immediately", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const peer: PagePeer = {
      offer: async () => "",
      answer: async () => {},
      ice: async () => {},
      close: async () => {},
      request: async (r) => {
        await new Promise<void>((resolve) => (release = resolve));
        return { requestId: r.requestId, revision: 0, outcome: "ok" };
      },
    };
    const s = new GatewayState({
      origins: ["http://localhost:5361"],
      peerFactory: () => peer,
    });
    try {
      const p = s.register("http://localhost:5361", {
        surface: "forge-editor",
        name: "Forge",
        build: "test",
      });
      s.attach("http://localhost:5361", p.pageToken, () => {});
      const pair = s.pair("a", p.invitation, ["inspect"], "agent");
      await s.signal(p.targetId, {
        type: "approve",
        pendingId: pair.pendingId,
        permissions: ["inspect"],
      });
      const r = {
        version: 1,
        requestId: "first",
        sessionId: pair.sessionId,
        targetId: p.targetId,
        epoch: p.epoch,
        operation: "forge.read",
        args: {},
      };
      let a: unknown, b: unknown;
      const first = s.command("a", r).then((v) => (a = v)),
        second = s
          .command("a", { ...r, requestId: "queued" })
          .then((v) => (b = v));
      await vi.advanceTimersByTimeAsync(0);
      await s.disconnect("a", pair.sessionId);
      await vi.advanceTimersByTimeAsync(0);
      expect(a).toMatchObject({ code: "REVOKED" });
      expect(b).toMatchObject({ code: "REVOKED" });
      release();
      await Promise.all([first, second]);
    } finally {
      await s.close();
      vi.useRealTimers();
    }
  });
  it("times out queued work without replaying it later", async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const calls: string[] = [];
    const peer: PagePeer = {
      offer: async () => "",
      answer: async () => {},
      ice: async () => {},
      close: async () => {},
      request: async (r) => {
        calls.push(r.requestId);
        await new Promise<void>((resolve) => (release = resolve));
        return { requestId: r.requestId, revision: 0, outcome: "ok" };
      },
    };
    const s = new GatewayState({
      origins: ["http://localhost:5361"],
      peerFactory: () => peer,
    });
    try {
      const p = s.register("http://localhost:5361", {
        surface: "forge-editor",
        name: "Forge",
        build: "test",
      });
      s.attach("http://localhost:5361", p.pageToken, () => {});
      const pair = s.pair("a", p.invitation, ["inspect"], "agent");
      await s.signal(p.targetId, {
        type: "approve",
        pendingId: pair.pendingId,
        permissions: ["inspect"],
      });
      const r = {
        version: 1,
        requestId: "first",
        sessionId: pair.sessionId,
        targetId: p.targetId,
        epoch: p.epoch,
        operation: "forge.read",
        args: {},
      };
      let firstOutcome: unknown, secondOutcome: unknown;
      const first = s.command("a", r).then((v) => (firstOutcome = v)),
        second = s
          .command("a", { ...r, requestId: "queued" })
          .then((v) => (secondOutcome = v));
      await vi.advanceTimersByTimeAsync(LIMITS.requestMs + 1);
      expect(firstOutcome).toMatchObject({
        outcome: "unknown",
        code: "REQUEST_TIMEOUT",
      });
      expect(secondOutcome).toMatchObject({
        outcome: "refused",
        code: "QUEUE_TIMEOUT",
      });
      release();
      await Promise.all([first, second]);
      expect(calls).toEqual(["first"]);
    } finally {
      await s.close();
      vi.useRealTimers();
    }
  });
  it("rechecks queued commands after page surface changes and prioritizes stop", async () => {
    let complete!: () => void;
    const calls: string[] = [];
    const peer: PagePeer = {
      offer: async () => "",
      answer: async () => {},
      ice: async () => {},
      close: async () => {},
      request: async (r) => {
        calls.push(r.operation);
        if (r.requestId === "first")
          await new Promise<void>((resolve) => (complete = resolve));
        return { requestId: r.requestId, revision: 0, outcome: "ok" };
      },
    };
    const s = new GatewayState({
      origins: ["http://localhost:5361"],
      peerFactory: () => peer,
    });
    const p = s.register("http://localhost:5361", {
      surface: "forge-editor",
      name: "Forge",
      build: "test",
    });
    s.attach("http://localhost:5361", p.pageToken, () => {});
    const paired = s.pair("a", p.invitation, ["inspect", "test"], "agent");
    await s.signal(p.targetId, {
      type: "approve",
      pendingId: paired.pendingId,
      permissions: ["inspect", "test"],
    });
    const r = {
      version: 1,
      requestId: "first",
      sessionId: paired.sessionId,
      targetId: p.targetId,
      epoch: p.epoch,
      operation: "forge.read",
      args: {},
    };
    const first = s.command("a", r);
    await Promise.resolve();
    const queued = s.command("a", { ...r, requestId: "queued" });
    await s.signal(p.targetId, { type: "surface", surface: "forge-play" });
    expect(
      (
        await s.command("a", {
          ...r,
          requestId: "stop",
          operation: "play.stop",
          expectedRevision: 0,
        })
      ).outcome,
    ).toBe("ok");
    expect(calls).toEqual(["forge.read", "play.stop"]);
    complete();
    await first;
    expect((await queued).code).toBe("SURFACE_DENIED");
    await s.close();
  });
  it("requires Origin, page credential and approval; isolates bootstrap principals", async () => {
    let now = 100;
    const sent: unknown[] = [];
    let closed = false;
    const peer: PagePeer = {
      offer: async () => "offer",
      answer: async () => {},
      ice: async () => {},
      request: async (r) => ({
        requestId: r.requestId,
        revision: 0,
        outcome: "ok",
        data: "page result",
      }),
      close: async () => {
        closed = true;
      },
    };
    const state = new GatewayState({
      origins: ["http://localhost:5361"],
      now: () => now,
      peerFactory: () => peer,
    });
    expect(() =>
      state.register("http://evil.test", {
        surface: "forge-editor",
        name: "Forge",
        build: "test",
      }),
    ).toThrow("ORIGIN_DENIED");
    const page = state.register("http://localhost:5361", {
      surface: "forge-editor",
      name: "Forge",
      build: "test",
    });
    expect(() =>
      state.attach("http://localhost:5361", "bad", () => {}),
    ).toThrow();
    state.attach("http://localhost:5361", page.pageToken, (m) => sent.push(m));
    const pending = state.pair("a", page.invitation, ["inspect"], "claimed");
    const req = {
      version: 1,
      requestId: "r",
      sessionId: pending.sessionId,
      targetId: page.targetId,
      epoch: page.epoch,
      operation: "forge.read",
      args: {},
    };
    expect((await state.command("a", req)).code).toBe("NOT_PAIRED");
    expect(() =>
      state.pair("b", page.invitation, ["inspect"], "other"),
    ).toThrow();
    await state.signal(page.targetId, {
      type: "approve",
      pendingId: pending.pendingId,
      permissions: ["inspect"],
    });
    expect((await state.command("b", req)).code).toBe("NOT_PAIRED");
    expect((await state.command("a", req)).outcome).toBe("ok");
    await state.signal(page.targetId, {
      type: "surface",
      surface: "forge-play",
    });
    expect((await state.command("a", req)).code).toBe("SURFACE_DENIED");
    await expect(
      state.signal(page.targetId, {
        type: "surface",
        surface: "testroom-solo",
      }),
    ).rejects.toThrow("SURFACE_DENIED");
    await state.signal(page.targetId, {
      type: "surface",
      surface: "forge-editor",
    });
    expect(state.status("b").sessions).toEqual([]);
    await state.disconnect("a", pending.sessionId);
    expect(closed).toBe(true);
    expect((await state.command("a", req)).code).toBe("NOT_PAIRED");
    now += LIMITS.invitationMs + 1;
    expect(() =>
      state.pair("a", page.invitation, ["inspect"], "claimed"),
    ).toThrow();
    await state.close();
  });
  it("LATER 432: a pair request late in the invitation keeps its full approval window", async () => {
    let now = 0;
    const sent: { type: string }[] = [];
    const state = new GatewayState({
      origins: ["http://localhost:5361"],
      now: () => now,
      peerFactory: () => ({
        offer: async () => "offer",
        answer: async () => {},
        ice: async () => {},
        close: async () => {},
        request: async (r) => ({ requestId: r.requestId, revision: 0, outcome: "ok" }),
      }),
    });
    try {
      const p = state.register("http://localhost:5361", { surface: "forge-editor", name: "Forge", build: "test" });
      state.attach("http://localhost:5361", p.pageToken, (m) => sent.push(m));
      now = LIMITS.invitationMs - 5000;
      const pair = state.pair("a", p.invitation, ["inspect"], "agent");
      // The person approves 60 s later, after the invitation itself has run out.
      now = LIMITS.invitationMs + 55000;
      expect(state.status("a").sessions).toEqual([expect.objectContaining({ state: "pending" })]);
      await state.signal(p.targetId, { type: "approve", pendingId: pair.pendingId, permissions: ["inspect"] });
      expect(sent.map((m) => m.type)).toEqual(["pending", "offer"]);
      expect(state.status("a").sessions).toEqual([expect.objectContaining({ state: "paired" })]);
    } finally {
      await state.close();
    }
  });
  it("LATER 432: an unanswered pair request still ends with its approval window", async () => {
    let now = 0;
    const sent: { type: string; reason?: string }[] = [];
    const state = new GatewayState({ origins: ["http://localhost:5361"], now: () => now });
    try {
      const p = state.register("http://localhost:5361", { surface: "forge-editor", name: "Forge", build: "test" });
      state.attach("http://localhost:5361", p.pageToken, (m) => sent.push(m));
      now = LIMITS.invitationMs - 5000;
      state.pair("a", p.invitation, ["inspect"], "agent");
      now = 2 * LIMITS.invitationMs - 4000;
      expect(state.status("a").sessions).toEqual([]);
      expect(sent.at(-1)).toEqual({ type: "revoked", reason: "INVITATION_EXPIRED" });
    } finally {
      await state.close();
    }
  });
  it("LATER 433: the page token is a one-time socket ticket, good only briefly after registration", async () => {
    let now = 0;
    const state = new GatewayState({ origins: ["http://localhost:5361"], now: () => now });
    const target = { surface: "forge-editor", name: "Forge", build: "test" };
    try {
      // A token a header-logging edge recorded is no use once the page's own socket has attached ...
      const p = state.register("http://localhost:5361", target);
      const attached = state.attach("http://localhost:5361", p.pageToken, () => {});
      expect(() => state.attach("http://localhost:5361", p.pageToken, () => {})).toThrow("PAGE_AUTH_DENIED");
      attached.detach();
      expect(() => state.attach("http://localhost:5361", p.pageToken, () => {})).toThrow("PAGE_AUTH_DENIED");
      // ... nor, when that socket never attached, after the attach window -- while its invitation is still live.
      const late = state.register("http://localhost:5361", target);
      now = LIMITS.requestMs + 1;
      expect(now).toBeLessThan(late.expiresAt);
      expect(() => state.attach("http://localhost:5361", late.pageToken, () => {})).toThrow("PAGE_AUTH_DENIED");
      const prompt = state.register("http://localhost:5361", target);
      now += LIMITS.requestMs;
      state.attach("http://localhost:5361", prompt.pageToken, () => {});
    } finally {
      await state.close();
    }
  });
  it("rejects expired invitations and foreign signaling bindings", async () => {
    let now = 0;
    const state = new GatewayState({
      origins: ["http://localhost:5361"],
      now: () => now,
    });
    const p = state.register("http://localhost:5361", {
      surface: "forge-editor",
      name: "x",
      build: "b",
    });
    state.attach("http://localhost:5361", p.pageToken, () => {});
    await expect(
      state.signal(p.targetId, {
        type: "answer",
        sessionId: p.targetId,
        targetId: p.targetId,
        epoch: p.epoch,
        sdp: "x",
      }),
    ).rejects.toThrow();
    now = LIMITS.invitationMs + 1;
    expect(() => state.pair("a", p.invitation, ["inspect"], "agent")).toThrow(
      "INVITATION_EXPIRED",
    );
    await state.close();
  });
});
describe("client address budgets (browser adaptation: gateway policy)", () => {
  const forwarded = (port: number, address?: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (address !== undefined) headers.set("X-Forwarded-For", address);
    return fetch(`http://127.0.0.1:${port}${init.method === "POST" ? "/api/v1/targets" : "/health"}`, { ...init, headers });
  };
  const gateway = (port: number, trustedProxies?: number) =>
    createGateway({
      issuer: `http://127.0.0.1:${port}`,
      origins: ["http://localhost:5361"],
      development: true,
      now: () => 1000,
      trustedProxies,
    });
  it("ignores a forged X-Forwarded-For with no trusted proxy hops", async () => {
    const port = await freePort();
    const g = gateway(port);
    await g.listen(port);
    try {
      for (let i = 0; i < 60; i++) expect((await forwarded(port, `198.51.100.${i}`)).status).toBe(200);
      expect((await forwarded(port, "192.0.2.77")).status).toBe(429);
    } finally {
      await g.close();
    }
  });
  it("honours the configured hop of X-Forwarded-For and gives forwarded clients separate buckets", async () => {
    const port = await freePort();
    const g = gateway(port, 1);
    await g.listen(port);
    try {
      for (let i = 0; i < 60; i++) expect((await forwarded(port, "198.51.100.9, 203.0.113.1")).status).toBe(200);
      expect((await forwarded(port, " 203.0.113.1 ")).status).toBe(429);
      // A client-written entry left of the proxy's own does not move the key.
      expect((await forwarded(port, "203.0.113.2, 203.0.113.1")).status).toBe(429);
      expect((await forwarded(port, "203.0.113.1, 203.0.113.2")).status).toBe(200);
      // No header: the socket address keys its own bucket.
      expect((await forwarded(port)).status).toBe(200);
    } finally {
      await g.close();
    }
  });
  it("refuses the fifth live unpaired registration from one address while another address registers", async () => {
    const port = await freePort();
    const g = gateway(port, 1);
    await g.listen(port);
    const register = (address: string) =>
      forwarded(port, address, {
        method: "POST",
        headers: { Origin: "http://localhost:5361", "Content-Type": "application/json" },
        body: JSON.stringify({ surface: "forge-editor", name: "Forge", build: "test" }),
      });
    try {
      for (let i = 0; i < 4; i++) expect((await register("203.0.113.1")).status).toBe(201);
      const fifth = await register("203.0.113.1");
      expect(fifth.status).toBe(403);
      expect(await fifth.json()).toEqual({ code: "ADDRESS_CAPACITY" });
      expect((await register("203.0.113.2")).status).toBe(201);
    } finally {
      await g.close();
    }
  });
  it("counts only live unpaired targets against an address's budget", async () => {
    let now = 0;
    const state = new GatewayState({ origins: ["http://localhost:5361"], now: () => now, maxTargetsPerAddress: 2 });
    const target = { surface: "forge-editor", name: "Forge", build: "test" };
    const first = state.register("http://localhost:5361", target, "a");
    state.register("http://localhost:5361", target, "a");
    expect(() => state.register("http://localhost:5361", target, "a")).toThrow("ADDRESS_CAPACITY");
    state.register("http://localhost:5361", target, "b");
    state.attach("http://localhost:5361", first.pageToken, () => {});
    state.pair("p", first.invitation, ["inspect"], "agent");
    state.register("http://localhost:5361", target, "a");
    expect(() => state.register("http://localhost:5361", target, "a")).toThrow("ADDRESS_CAPACITY");
    now = LIMITS.invitationMs + 1;
    state.register("http://localhost:5361", target, "a");
    await state.close();
  });
  it("LATER 428: keys the SDK's /register limiter on the client address, not the proxy's", async () => {
    const g = gateway(0, 1);
    await g.listen(0);
    const port = (g.server.address() as AddressInfo).port;
    const register = (address: string) =>
      fetch(`http://127.0.0.1:${port}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": address },
        body: JSON.stringify({ redirect_uris: ["http://127.0.0.1:5369/callback"], token_endpoint_auth_method: "none" }),
      });
    try {
      // The SDK's registration limiter allows 20 an hour per key.
      for (let i = 0; i < 20; i++) expect((await register("203.0.113.1")).status).toBe(201);
      expect((await register("203.0.113.1")).status).toBe(429);
      expect((await register("203.0.113.2")).status).toBe(201);
    } finally {
      await g.close();
    }
  });
  it("LATER 429: bounds pending and paired sessions per client address", async () => {
    const state = new GatewayState({ origins: ["http://localhost:5361"], maxSessionsPerAddress: 1, peerFactory: () => ({
      offer: async () => "", answer: async () => {}, ice: async () => {}, close: async () => {},
      request: async (r) => ({ requestId: r.requestId, revision: 0, outcome: "ok" }),
    }) });
    const target = { surface: "forge-editor", name: "Forge", build: "test" };
    const pages = [0, 1, 2].map((i) => {
      const p = state.register("http://localhost:5361", target, `page${i}`);
      state.attach("http://localhost:5361", p.pageToken, () => {});
      return p;
    });
    try {
      const first = state.pair("a", pages[0]!.invitation, ["inspect"], "agent", "203.0.113.1");
      expect(() => state.pair("b", pages[1]!.invitation, ["inspect"], "agent", "203.0.113.1")).toThrow("ADDRESS_CAPACITY");
      // A paired session still counts against its address.
      await state.signal(pages[0]!.targetId, { type: "approve", pendingId: first.pendingId, permissions: ["inspect"] });
      expect(() => state.pair("c", pages[2]!.invitation, ["inspect"], "agent", "203.0.113.1")).toThrow("ADDRESS_CAPACITY");
      state.pair("d", pages[1]!.invitation, ["inspect"], "agent", "203.0.113.2");
    } finally {
      await state.close();
    }
  });
  it("LATER 429: the gateway's /register spends the forwarded client's own client quota", async () => {
    const g = createGateway({
      issuer: "http://127.0.0.1:5361",
      origins: ["http://localhost:5361"],
      development: true,
      trustedProxies: 1,
      maxClientsPerAddress: 1,
    });
    await g.listen(0);
    const port = (g.server.address() as AddressInfo).port;
    const register = (address: string) =>
      fetch(`http://127.0.0.1:${port}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": address },
        body: JSON.stringify({ redirect_uris: ["http://127.0.0.1:5369/callback"], token_endpoint_auth_method: "none" }),
      });
    try {
      expect((await register("203.0.113.1")).status).toBe(201);
      expect((await register("203.0.113.1")).status).toBe(400);
      expect((await register("203.0.113.2")).status).toBe(201);
    } finally {
      await g.close();
    }
  });
  it("LATER 429: the gateway's /token spends the forwarded client's own token quota", async () => {
    const issuer = "http://127.0.0.1:5361";
    const g = createGateway({
      issuer,
      origins: ["http://localhost:5361"],
      development: true,
      trustedProxies: 1,
      maxTokensPerAddress: 1,
    });
    await g.listen(0);
    const port = (g.server.address() as AddressInfo).port;
    const redirect = "http://127.0.0.1:5369/callback",
      verifier = "v".repeat(43),
      challenge = createHash("sha256").update(verifier).digest("base64url");
    try {
      const registered = await fetch(`http://127.0.0.1:${port}/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": "203.0.113.1" },
        body: JSON.stringify({ redirect_uris: [redirect], token_endpoint_auth_method: "none" }),
      });
      expect(registered.status).toBe(201);
      const client = await registered.json();
      // The code is issued in-process; the exchange is the HTTP path under test, keyed by its forwarded address.
      const token = (address: string) =>
        fetch(`http://127.0.0.1:${port}/token`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Forwarded-For": address },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: client.client_id,
            code: g.oauth.issueCode(client, {
              codeChallenge: challenge,
              redirectUri: redirect,
              resource: new URL("/mcp", issuer),
            }),
            code_verifier: verifier,
            redirect_uri: redirect,
            resource: new URL("/mcp", issuer).href,
          }),
        });
      expect((await token("203.0.113.1")).status).toBe(200);
      const refused = await token("203.0.113.1");
      expect(refused.status).toBe(400);
      expect((await refused.json()).error_description).toBe("Token address capacity");
      expect((await token("203.0.113.2")).status).toBe(200);
    } finally {
      await g.close();
    }
  });
  it("LATER 431: refuses trusted proxy hops on a bind a client can reach directly", async () => {
    const production = { issuer: "https://forge.example", origins: ["https://forge.example"] };
    const edge = createGateway({ ...production, trustedProxies: 1 });
    try {
      await expect(edge.listen(0, "0.0.0.0")).rejects.toThrow("TRUSTED_PROXIES_REQUIRE_LOOPBACK");
      await expect(edge.listen(0, "::")).rejects.toThrow("TRUSTED_PROXIES_REQUIRE_LOOPBACK");
      expect(edge.server.listening).toBe(false);
      await edge.listen(0, "127.0.0.1");
      expect(edge.server.listening).toBe(true);
    } finally {
      await edge.close();
    }
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const direct = createGateway(production);
    try {
      await direct.listen(0, "0.0.0.0");
      expect(direct.server.listening).toBe(true);
    } finally {
      await direct.close();
      warn.mockRestore();
    }
  });
  it("warns once in production when no proxy hop is trusted, and refuses an invalid hop count", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const production = { issuer: "https://forge.example", origins: ["https://forge.example"] };
      const shared = createGateway(production);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]![0])).toContain("FORGE_AGENT_TRUSTED_PROXIES");
      await shared.close();
      const edge = createGateway({ ...production, trustedProxies: 1 });
      expect(warn).toHaveBeenCalledTimes(1);
      await edge.close();
      expect(() => createGateway({ ...production, trustedProxies: -1 })).toThrow("INVALID_TRUSTED_PROXIES");
      expect(() => createGateway({ ...production, trustedProxies: 1.5 })).toThrow("INVALID_TRUSTED_PROXIES");
    } finally {
      warn.mockRestore();
    }
  });
});
