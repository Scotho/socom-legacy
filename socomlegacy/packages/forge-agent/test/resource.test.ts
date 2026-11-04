// Product track (the agent gateway's OAuth, a browser adaptation): the RFC 8707 resource a client names is compared
// in one canonical form, `${origin}/mcp`, with or without ONE trailing slash and nothing else (the MCP
// authorization spec's canonical-URI guidance; a native Claude Code client sent `/mcp` plus a suffix, 2026-10-25).
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import type { Response } from "express";
import { GuestOAuth, canonicalResource } from "../src/oauth.js";
import { createGateway } from "../src/gateway.js";

const ORIGIN = "http://127.0.0.1:5360";
const refusedSuffixes = (origin: string) => [
  `${origin}/mcp//`,
  `${origin}/mcp/x`,
  `${origin}/mcp.`,
  `${origin}/MCP`,
  `${origin}/mcp?x=1`,
  `${origin}/mcp?`,
  `${origin}/mcp#f`,
  `${origin}/mcp/#f`,
  `${origin}/`,
  `${origin}`,
  `${origin.replace("://", "://u:p@")}/mcp`,
  `http://localhost:${new URL(origin).port}/mcp`,
  `http://127.0.0.1:${Number(new URL(origin).port) + 1}/mcp`,
  `https://127.0.0.1:${new URL(origin).port}/mcp`,
];
const verifier = "v".repeat(43),
  challenge = createHash("sha256").update(verifier).digest("base64url");
const quiet = {
  cookie: () => {},
  setHeader: () => {},
  type: () => quiet,
  send: () => {},
} as unknown as Response;
const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
  });

describe("canonicalResource", () => {
  it("returns the canonical `${origin}/mcp` for /mcp and /mcp/ only", () => {
    expect(canonicalResource(`${ORIGIN}/mcp`, ORIGIN)).toBe(`${ORIGIN}/mcp`);
    expect(canonicalResource(`${ORIGIN}/mcp/`, ORIGIN)).toBe(`${ORIGIN}/mcp`);
    expect(canonicalResource(new URL(`${ORIGIN}/mcp/`), ORIGIN)).toBe(`${ORIGIN}/mcp`);
    for (const raw of refusedSuffixes(ORIGIN)) expect(canonicalResource(raw, ORIGIN), raw).toBeNull();
    expect(canonicalResource(undefined, ORIGIN)).toBeNull();
    expect(canonicalResource("not a url", ORIGIN)).toBeNull();
  });
});

describe("GuestOAuth resource audience", () => {
  it("accepts /mcp/ at authorize, code issue and token exchange, and stores the canonical audience", async () => {
    const p = new GuestOAuth(new URL(`${ORIGIN}/mcp`));
    try {
      const client = await p.clientsStore.registerClient!({
        redirect_uris: ["http://localhost:8888/callback"],
        token_endpoint_auth_method: "none",
      });
      const params = {
        codeChallenge: challenge,
        redirectUri: client.redirect_uris[0]!,
        resource: new URL(`${ORIGIN}/mcp/`),
      };
      await p.authorize(client, params, quiet);
      // A code asked for /mcp/ exchanges under /mcp, and the other way round: one canonical resource.
      for (const [asked, exchanged] of [
        [`${ORIGIN}/mcp/`, `${ORIGIN}/mcp`],
        [`${ORIGIN}/mcp`, `${ORIGIN}/mcp/`],
        [`${ORIGIN}/mcp/`, `${ORIGIN}/mcp/`],
      ]) {
        const code = p.issueCode(client, { ...params, resource: new URL(asked!) });
        const tokens = await p.exchangeAuthorizationCode(
          client,
          code,
          verifier,
          params.redirectUri,
          new URL(exchanged!),
        );
        const info = await p.verifyAccessToken(tokens.access_token);
        expect(info.resource?.href).toBe(`${ORIGIN}/mcp`);
      }
    } finally {
      p.close();
    }
  });
  it("refuses every other form with the unchanged codes", async () => {
    const p = new GuestOAuth(new URL(`${ORIGIN}/mcp`));
    try {
      const client = await p.clientsStore.registerClient!({
        redirect_uris: ["http://localhost:8888/callback"],
        token_endpoint_auth_method: "none",
      });
      const params = { codeChallenge: challenge, redirectUri: client.redirect_uris[0]! };
      await expect(p.authorize(client, params, quiet)).rejects.toThrow("Wrong resource audience");
      for (const raw of refusedSuffixes(ORIGIN)) {
        const resource = new URL(raw);
        await expect(p.authorize(client, { ...params, resource }, quiet), raw).rejects.toThrow(
          "Wrong resource audience",
        );
        expect(() => p.issueCode(client, { ...params, resource }), raw).toThrow("Wrong resource audience");
        const code = p.issueCode(client, { ...params, resource: new URL(`${ORIGIN}/mcp`) });
        await expect(
          p.exchangeAuthorizationCode(client, code, verifier, params.redirectUri, resource),
          raw,
        ).rejects.toThrow("Invalid code binding");
      }
    } finally {
      p.close();
    }
  });
});

describe("gateway resource audience on the wire", () => {
  it("logs in with resource /mcp/ through /authorize, consent and /token, and the bearer opens the API", async () => {
    const port = await freePort(),
      origin = `http://127.0.0.1:${port}`;
    const g = createGateway({ issuer: origin, origins: ["http://localhost:5361"], development: true });
    await g.listen(port);
    try {
      const prm = await (await fetch(`${origin}/.well-known/oauth-protected-resource/mcp`)).json();
      expect(prm.resource).toBe(`${origin}/mcp`);
      const c = await g.oauth.clientsStore.registerClient!({
        redirect_uris: ["http://localhost:8888/cb"],
        token_endpoint_auth_method: "none",
      });
      const authorize = (resource: string) =>
        fetch(
          `${origin}/authorize?${new URLSearchParams({
            response_type: "code",
            client_id: c.client_id,
            redirect_uri: c.redirect_uris[0]!,
            code_challenge: challenge,
            code_challenge_method: "S256",
            resource,
          })}`,
          { redirect: "manual" },
        );
      for (const raw of refusedSuffixes(origin)) {
        const refused = await authorize(raw);
        expect(refused.status, raw).toBe(302);
        const to = new URL(refused.headers.get("location")!);
        expect(to.searchParams.get("error"), raw).toBe("invalid_request");
        expect(to.searchParams.get("error_description"), raw).toBe("Wrong resource audience");
      }
      const page = await authorize(`${origin}/mcp/`);
      expect(page.status).toBe(200);
      const html = await page.text(),
        id = /name="id" value="([^"]+)"/.exec(html)![1]!,
        csrf = /name="csrf" value="([^"]+)"/.exec(html)![1]!;
      const consent = await fetch(`${origin}/guest/consent`, {
        method: "POST",
        redirect: "manual",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: origin,
          Cookie: `s2u_guest_consent=${csrf}`,
        },
        body: new URLSearchParams({ id, csrf, decision: "approve" }).toString(),
      });
      expect(consent.status).toBe(302);
      const code = new URL(consent.headers.get("location")!).searchParams.get("code")!;
      expect(code).toBeTruthy();
      const token = await fetch(`${origin}/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: c.client_id,
          code,
          code_verifier: verifier,
          redirect_uri: c.redirect_uris[0]!,
          resource: `${origin}/mcp/`,
        }).toString(),
      });
      expect(token.status).toBe(200);
      const { access_token } = await token.json();
      expect((await g.oauth.verifyAccessToken(access_token)).resource?.href).toBe(`${origin}/mcp`);
      const status = await fetch(`${origin}/api/v1/status`, {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      expect(status.status).toBe(200);
    } finally {
      await g.close();
    }
  });
});
