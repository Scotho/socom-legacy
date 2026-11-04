import { describe, it, expect } from "vitest";
import { GuestOAuth } from "../src/oauth.js";
import { createHash } from "node:crypto";
import type { Response } from "express";
describe("guest bootstrap", () => {
  it("allows only self and the selected validated callback origin in each consent CSP", async () => {
    const p = new GuestOAuth(new URL("http://127.0.0.1:5360/mcp"));
    try {
      const callbacks = [
        "http://127.0.0.1:5369/callback?state=client",
        "https://client.example/oauth/callback",
        "http://[::1]:5369/callback",
      ];
      const client = await p.clientsStore.registerClient!({
        redirect_uris: callbacks,
        token_endpoint_auth_method: "none",
      });
      for (const redirectUri of callbacks) {
        const headers = new Map<string, string>();
        const response = {
          cookie: () => {},
          setHeader: (name: string, value: string) => headers.set(name, value),
          type: () => response,
          send: () => {},
        } as unknown as Response;
        await p.authorize(
          client,
          {
            redirectUri,
            codeChallenge: "a".repeat(43),
            resource: new URL("http://127.0.0.1:5360/mcp"),
          },
          response,
        );
        expect(headers.get("Content-Security-Policy")).toBe(
          `default-src 'none'; form-action 'self' ${new URL(redirectUri).origin}; frame-ancestors 'none'; base-uri 'none'`,
        );
      }
      const headers = new Map<string, string>();
      const response = {
        setHeader: (name: string, value: string) => headers.set(name, value),
      } as unknown as Response;
      await expect(
        p.authorize(
          client,
          {
            redirectUri: "https://unregistered.example/callback",
            codeChallenge: "a".repeat(43),
            resource: new URL("http://127.0.0.1:5360/mcp"),
          },
          response,
        ),
      ).rejects.toThrow("Invalid redirect");
      expect(headers.size).toBe(0);
    } finally {
      p.close();
    }
  });
  it("rejects redirect hostnames containing CSP syntax instead of reflecting them", () => {
    const p = new GuestOAuth(new URL("http://127.0.0.1:5360/mcp"));
    try {
      expect(() =>
        p.clientsStore.registerClient!({
          redirect_uris: ["https://client.example;form-action/callback"],
          token_endpoint_auth_method: "none",
        }),
      ).toThrow("Public clients");
    } finally {
      p.close();
    }
  });
  it("binds codes to PKCE, redirect, resource and one exchange; guests stay distinct", async () => {
    let now = 0;
    const p = new GuestOAuth(new URL("http://127.0.0.1:5360/mcp"), () => now);
    const client = await p.clientsStore.registerClient!({
      redirect_uris: ["http://localhost:8888/callback"],
      token_endpoint_auth_method: "none",
    });
    const verifier = "v".repeat(43),
      challenge = createHash("sha256").update(verifier).digest("base64url");
    const issue = () =>
      p.issueCode(client, {
        codeChallenge: challenge,
        redirectUri: client.redirect_uris[0]!,
        resource: new URL("http://127.0.0.1:5360/mcp"),
      });
    const code = issue();
    await expect(
      p.exchangeAuthorizationCode(
        client,
        code,
        "bad",
        client.redirect_uris[0],
        new URL("http://127.0.0.1:5360/mcp"),
      ),
    ).rejects.toThrow();
    const tokens = await p.exchangeAuthorizationCode(
      client,
      code,
      verifier,
      client.redirect_uris[0],
      new URL("http://127.0.0.1:5360/mcp"),
    );
    const a = await p.verifyAccessToken(tokens.access_token);
    expect(a.scopes).toEqual(["bootstrap"]);
    await expect(
      p.exchangeAuthorizationCode(
        client,
        code,
        verifier,
        client.redirect_uris[0],
        new URL("http://127.0.0.1:5360/mcp"),
      ),
    ).rejects.toThrow();
    const other = await p.exchangeAuthorizationCode(
      client,
      issue(),
      verifier,
      client.redirect_uris[0],
      new URL("http://127.0.0.1:5360/mcp"),
    );
    expect(
      (await p.verifyAccessToken(other.access_token)).extra!.principalId,
    ).not.toBe(a.extra!.principalId);
    now = 9 * 60 * 60 * 1000;
    await expect(p.verifyAccessToken(tokens.access_token)).rejects.toThrow();
  });
  it("LATER 429: bounds registered clients and live tokens per client address", async () => {
    let address = "198.51.100.1";
    const resource = new URL("http://127.0.0.1:5360/mcp");
    const p = new GuestOAuth(resource, Date.now, () => {}, {
      address: () => address,
      clientsPerAddress: 2,
      tokensPerAddress: 1,
    });
    try {
      const input = { redirect_uris: ["http://localhost:8888/callback"], token_endpoint_auth_method: "none" };
      const client = await p.clientsStore.registerClient!(input);
      await p.clientsStore.registerClient!(input);
      expect(() => p.clientsStore.registerClient!(input)).toThrow("Registration address capacity");
      address = "198.51.100.2";
      await p.clientsStore.registerClient!(input);
      const verifier = "v".repeat(43),
        challenge = createHash("sha256").update(verifier).digest("base64url");
      const exchange = () =>
        p.exchangeAuthorizationCode(
          client,
          p.issueCode(client, { codeChallenge: challenge, redirectUri: client.redirect_uris[0]!, resource }),
          verifier,
          client.redirect_uris[0],
          resource,
        );
      address = "198.51.100.1";
      await exchange();
      await expect(exchange()).rejects.toThrow("Token address capacity");
      address = "198.51.100.2";
      await exchange();
    } finally {
      p.close();
    }
  });
});
