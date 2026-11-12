import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createGateway } from "../src/gateway.js";
import { schema } from "../src/mcp.js";
import { GatewayState } from "../src/sessions.js";
import { freePort } from "./ports.js";

/**
 * AX-U (C6; a browser adaptation, FG.R2): `GET /join/<invitation>` answers a short page for a person or an agent -- what
 * the link is, what to call (`agent_pair` with this link) and the MCP endpoint -- and never reads, validates, spends or
 * reveals the invitation: an invitation the gateway never issued gets the same page as a live one.
 */
const ORIGIN = "http://localhost:5371";
async function withGateway(run: (base: string, g: ReturnType<typeof createGateway>) => Promise<void>) {
  const port = await freePort();
  const g = createGateway({ issuer: `http://127.0.0.1:${port}`, origins: [ORIGIN], development: true });
  await g.listen(port);
  try { await run(`http://127.0.0.1:${port}`, g); } finally { await g.close(); }
}
const register = (g: ReturnType<typeof createGateway>) =>
  g.state.register(ORIGIN, { surface: "forge-editor", name: "Forge", build: "test" });

describe("AX-U: the join route", () => {
  it("a person's browser gets a short HTML page: what the link is, what to call, the MCP endpoint", async () => {
    await withGateway(async (base) => {
      const res = await fetch(`${base}/join/abc-123`, { headers: { Accept: "text/html,application/xhtml+xml,*/*;q=0.8" } });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toMatch(/^text\/html; charset=utf-8/);
      const html = await res.text();
      expect(html).toContain("<title>Connect your agent</title>");
      expect(html).toContain("agent_pair");
      expect(html).toContain(`${base}/mcp`);
      expect(html).toMatch(/approve/i);
      expect(html).not.toMatch(/<(script|img|link|iframe|form)\b/);
      expect(html, "the invitation is never echoed").not.toContain("abc-123");
    });
  });

  it("an agent gets the same words as plain text (Accept without text/html)", async () => {
    await withGateway(async (base) => {
      for (const accept of ["text/plain", "*/*", ""]) {
        const res = await fetch(`${base}/join/abc-123`, { headers: accept ? { Accept: accept } : {} });
        expect(res.status, accept).toBe(200);
        expect(res.headers.get("content-type"), accept).toMatch(/^text\/plain; charset=utf-8/);
        const text = await res.text();
        expect(text).toContain("SOCOM 2 Legacy");
        expect(text).toContain("call agent_pair with this link");
        expect(text).toContain(`MCP endpoint: ${base}/mcp`);
        expect(text).toContain("permissions default to all");
        expect(text).not.toContain("abc-123");
      }
    });
  });

  it("the headers: no-store, no referrer, nosniff, Vary: Accept, the consent page's CSP style", async () => {
    await withGateway(async (base) => {
      const res = await fetch(`${base}/join/abc-123`, { headers: { Accept: "text/html" } });
      const html = await res.text();
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(res.headers.get("referrer-policy")).toBe("no-referrer");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      expect(res.headers.get("vary")).toMatch(/Accept/);
      expect(res.headers.get("x-robots-tag")).toBe("noindex");
      const css = /<style>([\s\S]*?)<\/style>/.exec(html)![1]!;
      const hash = createHash("sha256").update(css).digest("base64");
      expect(res.headers.get("content-security-policy")).toBe(
        `default-src 'none'; style-src 'sha256-${hash}'; form-action 'none'; frame-ancestors 'none'; base-uri 'none'`);
      const plain = await fetch(`${base}/join/abc-123`, { headers: { Accept: "text/plain" } });
      expect(plain.headers.get("cache-control")).toBe("no-store");
      expect(plain.headers.get("referrer-policy")).toBe("no-referrer");
      expect(plain.headers.get("content-security-policy")).toBe("default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
    });
  });

  it("touches no state: an unknown invitation gets the same page as a live one, which still pairs after", async () => {
    await withGateway(async (base, g) => {
      const live = register(g);
      const spies = (["pair", "status", "register", "attach", "signal", "command", "sweep"] as const)
        .map((name) => vi.spyOn(GatewayState.prototype, name));
      for (const accept of ["text/html", "text/plain"]) {
        const known = await (await fetch(`${base}/join/${live.invitation}`, { headers: { Accept: accept } })).text();
        const unknown = await (await fetch(`${base}/join/never-issued-invitation`, { headers: { Accept: accept } })).text();
        expect(unknown, accept).toBe(known);
        expect(known).not.toContain(live.invitation);
      }
      for (const spy of spies) { expect(spy, spy.getMockName()).not.toHaveBeenCalled(); spy.mockRestore(); }
      g.state.attach(ORIGIN, live.pageToken, () => {});
      expect(g.state.pair("agent", live.invitation, ["inspect"], "Agent")).toMatchObject({ state: "pending" });
    });
  });

  it("strict bounds: an invitation outside the protocol's identifier form is refused the same way, whatever it is", async () => {
    await withGateway(async (base) => {
      const answers = new Set<string>();
      for (const bad of ["a%2Fb", "a%20b", "x".repeat(129), "%3Cscript%3E", "a%00"]) {
        const res = await fetch(`${base}/join/${bad}`, { headers: { Accept: "text/plain" } });
        expect(res.status, bad).toBe(400);
        expect(res.headers.get("cache-control")).toBe("no-store");
        answers.add(await res.text());
      }
      expect(answers.size).toBe(1);
      expect([...answers][0]).not.toMatch(/script|x{20}/);
      expect((await fetch(`${base}/join/`)).status).toBe(404);
      expect((await fetch(`${base}/join/a/b`)).status).toBe(404);
      expect((await fetch(`${base}/join/abc`, { method: "POST" })).status).toBe(404);
    });
  });
});

/** AX-U (C6): the server instructions say what to do with a join link, for the merged AX result. */
describe("AX-U: the server instructions", () => {
  it("given a /join/ link, call agent_pair with it (permissions default to all); agent_guide first; then agent_capabilities and target.status", () => {
    const words = schema(new GatewayState({ origins: [] }), "http://127.0.0.1:5360").instructions;
    expect(words).toMatch(/link containing \/join\/.*call agent_pair with that link/);
    expect(words).toMatch(/permissions default to all/);
    expect(words).toMatch(/agent_guide first/);
    expect(words.indexOf("agent_capabilities")).toBeGreaterThan(words.indexOf("agent_guide"));
    expect(words).toContain("target.status");
    expect(words).not.toMatch(/only the permissions|copy the invitation/i);
  });
});
