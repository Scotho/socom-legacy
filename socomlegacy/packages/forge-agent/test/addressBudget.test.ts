import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { Response } from "express";
import { budgetAddress, GuestOAuth, OAUTH_STATE_VERSION } from "../src/oauth.js";
import { createGateway } from "../src/gateway.js";
import { freePort } from "./ports.js";

/**
 * LATER 482 (a browser adaptation, gateway policy -- product track): every per-address budget keys an IPv6 client by
 * its /64, so one client holding a /64 cannot rotate addresses to fill a store. IPv4 is unchanged.
 */
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const resource = new URL("http://127.0.0.1:5360/mcp");
const verifier = "v".repeat(43);
const challenge = createHash("sha256").update(verifier).digest("base64url");
const input = { redirect_uris: ["http://localhost:8888/callback"], token_endpoint_auth_method: "none" };
const response = () => {
  const r = { cookie: () => {}, setHeader: () => {}, type: () => r, send: () => {} };
  return r as unknown as Response;
};

describe("LATER 482: the budget key", () => {
  it("keys an IPv6 address by its /64 and leaves IPv4 and anything else alone", () => {
    expect(budgetAddress("2001:db8:1:2::1")).toBe(budgetAddress("2001:0db8:0001:0002:ffff:eeee:dddd:cccc"));
    expect(budgetAddress("2001:db8:1:2::1")).not.toBe(budgetAddress("2001:db8:1:3::1"));
    expect(budgetAddress("2001:DB8:1:2::1%eth0")).toBe(budgetAddress("2001:db8:1:2::9"));
    expect(budgetAddress("2001:db8:1:2::1")).toBe("2001:db8:1:2::/64");
    expect(budgetAddress("::1")).toBe("0:0:0:0::/64");
    expect(budgetAddress("198.51.100.1")).toBe("198.51.100.1");
    // A dual-stack socket's IPv4-mapped address is the IPv4 client, never the ::/64 every IPv4 client would share.
    expect(budgetAddress("::ffff:198.51.100.1")).toBe("198.51.100.1");
    expect(budgetAddress("::ffff:c633:6402")).toBe("198.51.100.2");
    expect(budgetAddress("unknown")).toBe("unknown");
    expect(budgetAddress("in-process")).toBe("in-process");
  });
});

describe("LATER 482: the OAuth stores share one budget per /64", () => {
  it("registrations, tokens, consents and codes from one /64 share a budget; another /64 is served", async () => {
    let n = 0,
      prefix = "2001:db8:0:1";
    // A fresh address inside the current /64 for every request.
    const p = new GuestOAuth(resource, Date.now, () => {}, {
      address: () => `${prefix}::${(++n).toString(16)}`,
      clientsPerAddress: 2,
      tokensPerAddress: 1,
      consentsPerAddress: 2,
      codesPerAddress: 2,
    });
    try {
      const client = await p.clientsStore.registerClient!(input);
      await p.clientsStore.registerClient!(input);
      expect(() => p.clientsStore.registerClient!(input)).toThrow("Registration address capacity");
      const params = { codeChallenge: challenge, redirectUri: client.redirect_uris[0]!, resource };
      await p.authorize(client, params, response());
      await p.authorize(client, params, response());
      await expect(p.authorize(client, params, response())).rejects.toThrow("Consent address capacity");
      const code = p.issueCode(client, params);
      p.issueCode(client, params);
      expect(() => p.issueCode(client, params)).toThrow("Code address capacity");
      await p.exchangeAuthorizationCode(client, code, verifier, params.redirectUri, resource);
      // The exchange freed one code; the token budget of the /64 is spent.
      const second = p.issueCode(client, params);
      await expect(
        p.exchangeAuthorizationCode(client, second, verifier, params.redirectUri, resource),
      ).rejects.toThrow("Token address capacity");
      prefix = "2001:db8:0:2";
      await p.clientsStore.registerClient!(input);
      await p.authorize(client, params, response());
      await p.exchangeAuthorizationCode(client, p.issueCode(client, params), verifier, params.redirectUri, resource);
    } finally {
      p.close();
    }
  });
  it("a persisted file's entries count by /64 when they load", () => {
    const d = mkdtempSync(join(tmpdir(), "s2u-later482-"));
    dirs.push(d);
    const file = join(d, "oauth.json"),
      expires = Date.now() + 60 * 60 * 1000;
    const clients = [1, 2, 3].map((i) => ({
      client: { ...input, client_id: `c${i}`, client_id_issued_at: 0 },
      address: `2001:db8:0:1::${i}`,
      expires,
    }));
    writeFileSync(file, JSON.stringify({ version: OAUTH_STATE_VERSION, clients, tokens: [] }));
    const p = new GuestOAuth(resource, Date.now, () => {}, { clientsPerAddress: 2 }, { stateFile: file });
    try {
      expect(["c1", "c2", "c3"].filter((id) => p.clientsStore.getClient(id))).toHaveLength(2);
    } finally {
      p.close();
    }
  });
});

describe("LATER 482: the gateway's budgets share one budget per /64", () => {
  it("rate bucket and target registrations: rotating addresses inside one /64 spends one budget", async () => {
    const port = await freePort();
    const g = createGateway({
      issuer: `http://127.0.0.1:${port}`,
      origins: ["http://localhost:5361"],
      development: true,
      now: () => 1000,
      trustedProxies: 1,
    });
    await g.listen(port);
    let n = 0;
    const send = (prefix: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      headers.set("X-Forwarded-For", `${prefix}::${(++n).toString(16)}`);
      return fetch(`http://127.0.0.1:${port}${init.method === "POST" ? "/api/v1/targets" : "/health"}`, {
        ...init,
        headers,
      });
    };
    const register = (prefix: string) =>
      send(prefix, {
        method: "POST",
        headers: { Origin: "http://localhost:5361", "Content-Type": "application/json" },
        body: JSON.stringify({ surface: "forge-editor", name: "Forge", build: "test" }),
      });
    try {
      // Targets: four live unpaired targets per address (sessions.ts maxTargetsPerAddress), the /64 one address.
      for (let i = 0; i < 4; i++) expect((await register("2001:db8:0:1")).status).toBe(201);
      const fifth = await register("2001:db8:0:1");
      expect(fifth.status).toBe(403);
      expect(await fifth.json()).toEqual({ code: "ADDRESS_CAPACITY" });
      expect((await register("2001:db8:0:2")).status).toBe(201);
      // The rate bucket: 60 tokens per address; 5 spent above by this /64.
      for (let i = 0; i < 55; i++) expect((await send("2001:db8:0:1")).status).toBe(200);
      expect((await send("2001:db8:0:1")).status).toBe(429);
      expect((await send("2001:db8:0:3")).status).toBe(200);
    } finally {
      await g.close();
    }
  });
});
