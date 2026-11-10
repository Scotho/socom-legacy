import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Response } from "express";
import { GuestOAuth } from "../src/oauth.js";

/**
 * FP-14 (FP.R10; a browser adaptation, FG.R2): the guest consent page in the shared design system -- AX-U's words (one
 * question naming the client, the client's name said to be self-reported), Approve and Decline, its CSS inlined from the system's tokens (the
 * gateway serves static HTML: no external fetch) and allowed by its hash alone; the CSRF flow unchanged.
 */
const here = dirname(fileURLToPath(import.meta.url));

async function consent(clientName?: string) {
  const p = new GuestOAuth(new URL("http://127.0.0.1:5360/mcp"));
  const client = await p.clientsStore.registerClient!({
    redirect_uris: ["http://127.0.0.1:5369/callback"], token_endpoint_auth_method: "none",
    ...(clientName ? { client_name: clientName } : {}),
  });
  const headers = new Map<string, string>();
  const cookies: unknown[][] = [];
  let html = "";
  const response = {
    cookie: (...args: unknown[]) => { cookies.push(args); },
    setHeader: (name: string, value: string) => headers.set(name, value),
    type: () => response,
    send: (body: string) => { html = body; },
  } as unknown as Response;
  await p.authorize(client, { redirectUri: "http://127.0.0.1:5369/callback", codeChallenge: "a".repeat(43),
    resource: new URL("http://127.0.0.1:5360/mcp"), scopes: ["bootstrap"] }, response);
  p.close();
  return { html, headers, cookies };
}

describe("FP-14: the consent page in the design system", () => {
  it("AX-U: the structure -- one stylesheet inline, a main card, one question, the client said self-reported, Approve and Decline", async () => {
    const { html } = await consent("Claude Code");
    const skeleton = [...html.matchAll(/<(\/?)([a-z0-9]+)/g)].filter((m) => !m[1]).map((m) => m[2]);
    expect(skeleton).toEqual(["html", "head", "meta", "meta", "title", "style", "body", "main", "p", "h1", "p", "p",
      "form", "input", "input", "div", "button", "button"]);
    expect(html).toContain("<title>Connect your agent</title>");
    expect(html).toContain("<h1>Allow Claude Code to sign in to SOCOM 2 Legacy as a guest?</h1>");
    expect(html).toContain("This only lets it ask to connect. You still press Allow on your own page before it can do anything there.");
    expect(html).toMatch(/<p class="hint">The name “Claude Code” is reported by the client\. This request ends in 5 minutes\.<\/p>/);
    expect(html).toMatch(/<button[^>]*name="decision" value="approve"[^>]*>Approve<\/button>/);
    expect(html).toMatch(/<button[^>]*name="decision" value="deny"[^>]*>Decline<\/button>/);
    expect(html).not.toMatch(/<(link|script|img)\b/);
    expect(html).not.toMatch(/url\(|@import|https?:\/\/(?!127\.0\.0\.1)/);
    expect(html).not.toMatch(/bootstrap/i);
  });

  it("a client without a name and a name with markup are said safely", async () => {
    const unnamed = (await consent()).html;
    expect(unnamed).toContain("<h1>Allow an unnamed MCP client to sign in to SOCOM 2 Legacy as a guest?</h1>");
    expect(unnamed).toContain('<p class="hint">The client did not give a name. This request ends in 5 minutes.</p>');
    const { html } = await consent("<b>x</b>");
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("its colours are the design system's tokens, and the CSP allows its one style by hash", async () => {
    const { html, headers } = await consent("C");
    const css = /<style>([\s\S]*?)<\/style>/.exec(html)![1]!;
    const tokens = readFileSync(resolve(here, "../../../../shared/ds/tokens.css"), "utf8").toLowerCase();
    for (const hex of css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []) expect(tokens, hex).toContain(`: ${hex.toLowerCase()};`);
    const hash = createHash("sha256").update(css).digest("base64");
    expect(headers.get("Content-Security-Policy")).toBe(
      `default-src 'none'; style-src 'sha256-${hash}'; form-action 'self' http://127.0.0.1:5369; frame-ancestors 'none'; base-uri 'none'`);
    for (const m of css.matchAll(/font-size:\s*(\d+)px/g)) expect(Number(m[1])).toBeGreaterThanOrEqual(12);
  });

  it("the CSRF flow is unchanged: the hidden id and csrf, the post to /guest/consent, the strict cookie", async () => {
    const { html, cookies } = await consent("C");
    expect(html).toMatch(/<form method="post" action="\/guest\/consent">/);
    const csrf = /<input type="hidden" name="csrf" value="([^"]+)">/.exec(html)![1]!;
    expect(html).toMatch(/<input type="hidden" name="id" value="[^"]+">/);
    expect(cookies).toEqual([["s2u_guest_consent", csrf, { httpOnly: true, secure: false, sameSite: "strict", path: "/guest/consent", maxAge: 300_000 }]]);
  });
});
