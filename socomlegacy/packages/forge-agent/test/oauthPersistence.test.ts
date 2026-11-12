import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { LIMITS } from "@s2u/forge-agent-protocol";
import { createGateway } from "../src/gateway.js";
import { GuestOAuth } from "../src/oauth.js";
import { freePort } from "./ports.js";

/** AX-11 (a browser adaptation, gateway policy): an operator-named file keeps OAuth clients and hashed tokens across a restart. */
const dirs: string[] = [];
const tempDir = () => {
  const d = mkdtempSync(join(tmpdir(), "s2u-oauth-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  vi.restoreAllMocks();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const resource = new URL("http://127.0.0.1:5360/mcp");
const verifier = "v".repeat(43);
const challenge = createHash("sha256").update(verifier).digest("base64url");
async function login(p: GuestOAuth, audience = resource) {
  const client = await p.clientsStore.registerClient!({
    redirect_uris: ["http://localhost:8888/callback"],
    token_endpoint_auth_method: "none",
    client_name: "test agent",
  });
  const params = { codeChallenge: challenge, redirectUri: client.redirect_uris[0]!, resource: audience };
  const tokens = await p.exchangeAuthorizationCode(
    client,
    p.issueCode(client, params),
    verifier,
    params.redirectUri,
    audience,
  );
  return { client, token: tokens.access_token };
}

describe("AX-11: OAuth state persistence", () => {
  it("a registered client and an issued token survive a new gateway on the same file; the token authorizes agent_status", async () => {
    const file = join(tempDir(), "oauth.json");
    const port = await freePort();
    const config = {
      issuer: `http://127.0.0.1:${port}`,
      origins: ["http://localhost:5361"],
      development: true,
      stateFile: file,
    };
    const first = createGateway(config);
    const { client, token } = await login(first.oauth, new URL(`http://127.0.0.1:${port}/mcp`));
    await first.close();
    const second = createGateway(config);
    await second.listen(port);
    const mcp = new Client({ name: "test", version: "1" });
    try {
      expect(await second.oauth.clientsStore.getClient(client.client_id)).toMatchObject({
        client_id: client.client_id,
        client_name: "test agent",
        redirect_uris: client.redirect_uris,
      });
      await mcp.connect(
        new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
          requestInit: { headers: { Authorization: `Bearer ${token}` } },
        }),
      );
      const status = await mcp.callTool({ name: "agent_status", arguments: {} });
      expect(status.structuredContent).toMatchObject({ sessions: [] });
    } finally {
      await mcp.close();
      await second.close();
    }
  });
  it("drops an expired token on load", async () => {
    const file = join(tempDir(), "oauth.json");
    let now = 1_000_000;
    const a = new GuestOAuth(resource, () => now, () => {}, {}, { stateFile: file });
    const { token } = await login(a);
    a.close();
    now += LIMITS.sessionAbsoluteMs + 1;
    const b = new GuestOAuth(resource, () => now, () => {}, {}, { stateFile: file });
    try {
      await expect(b.verifyAccessToken(token)).rejects.toThrow();
    } finally {
      b.close();
    }
    expect(readFileSync(file, "utf8")).not.toContain(createHash("sha256").update(token).digest("base64url"));
  });
  it("a revoked token stays revoked and is gone from the file", async () => {
    const file = join(tempDir(), "oauth.json");
    const a = new GuestOAuth(resource, Date.now, () => {}, {}, { stateFile: file });
    const { client, token } = await login(a);
    const hash = createHash("sha256").update(token).digest("base64url");
    a.close();
    expect(readFileSync(file, "utf8")).toContain(hash);
    const b = new GuestOAuth(resource, Date.now, () => {}, {}, { stateFile: file });
    await b.verifyAccessToken(token);
    await b.revokeToken(client, { token });
    b.close();
    expect(readFileSync(file, "utf8")).not.toContain(hash);
    const c = new GuestOAuth(resource, Date.now, () => {}, {}, { stateFile: file });
    try {
      await expect(c.verifyAccessToken(token)).rejects.toThrow();
    } finally {
      c.close();
    }
  });
  it("a corrupt file, or an unknown version, starts empty without crashing and logs a code, never the content", async () => {
    const dir = tempDir();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const [name, text] of [
      ["corrupt.json", "{not json SECRET-CONTENT"],
      ["version.json", JSON.stringify({ version: 999, clients: [], tokens: [], note: "SECRET-CONTENT" })],
      ["shape.json", JSON.stringify({ version: 1, clients: "SECRET-CONTENT", tokens: 7 })],
    ] as const) {
      const file = join(dir, name);
      writeFileSync(file, text);
      const p = new GuestOAuth(resource, Date.now, () => {}, {}, { stateFile: file });
      try {
        expect(p.clientsStore.getClient("anything")).toBeUndefined();
        const { token } = await login(p);
        await p.verifyAccessToken(token);
      } finally {
        p.close();
      }
    }
    expect(warn).toHaveBeenCalled();
    for (const call of warn.mock.calls) expect(call.join(" ")).not.toContain("SECRET-CONTENT");
  });
  it("never writes a raw token, a code or a verifier; the file is version-stamped and 0600", async () => {
    const dir = tempDir(),
      file = join(dir, "oauth.json");
    const p = new GuestOAuth(resource, Date.now, () => {}, {}, { stateFile: file });
    const { client, token } = await login(p);
    const code = p.issueCode(client, { codeChallenge: challenge, redirectUri: client.redirect_uris[0]!, resource });
    p.close();
    const text = readFileSync(file, "utf8");
    expect(text).not.toContain(token);
    expect(text).not.toContain(code);
    expect(text).not.toContain(verifier);
    expect(JSON.parse(text).version).toBe(1);
    if (process.platform !== "win32") expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readdirSync(dir)).toEqual(["oauth.json"]); // the temp file was renamed over, none left behind
  });
  it("writes at most once a second while running, and on close", async () => {
    vi.useFakeTimers();
    try {
      const file = join(tempDir(), "oauth.json");
      const p = new GuestOAuth(resource, Date.now, () => {}, {}, { stateFile: file });
      await login(p);
      await login(p);
      expect(() => statSync(file)).toThrow(); // nothing yet: debounced
      vi.advanceTimersByTime(1000);
      expect(JSON.parse(readFileSync(file, "utf8")).tokens).toHaveLength(2);
      await login(p);
      p.close();
      expect(JSON.parse(readFileSync(file, "utf8")).tokens).toHaveLength(3);
    } finally {
      vi.useRealTimers();
    }
  });
  it("unset: no file is written", async () => {
    const dir = tempDir();
    const port = await freePort();
    const g = createGateway({ issuer: `http://127.0.0.1:${port}`, origins: ["http://localhost:5361"], development: true });
    await login(g.oauth, new URL(`http://127.0.0.1:${port}/mcp`));
    await g.close();
    const p = new GuestOAuth(resource);
    await login(p);
    p.close();
    expect(readdirSync(dir)).toEqual([]);
  });
});
