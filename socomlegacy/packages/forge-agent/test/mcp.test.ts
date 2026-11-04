import { it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createMcpServer } from "../src/mcp.js";
import { GatewayState } from "../src/sessions.js";
import { createGateway } from "../src/gateway.js";
import { createHash } from "node:crypto";
import { freePort } from "./ports.js";
it("SDK initializes, discovers bootstrap tools and refuses unpaired commands in memory", async () => {
  const state = new GatewayState({ origins: [] }),
    server = createMcpServer(state, "guest", "http://127.0.0.1:5360");
  const client = new Client({ name: "test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  try {
    const list = await client.listTools();
    expect(list.tools.map((t) => t.name)).toContain("agent_capabilities");
    const status = await client.callTool({
      name: "agent_status",
      arguments: {},
    });
    expect(status.structuredContent).toMatchObject({ sessions: [] });
    const result = await client.callTool({
      name: "agent_request",
      arguments: {
        version: 1,
        requestId: "r",
        sessionId: "s",
        targetId: "t",
        epoch: "e",
        operation: "forge.read",
        args: {},
      },
    });
    expect(result.structuredContent).toMatchObject({ code: "NOT_PAIRED" });
  } finally {
    await client.close();
    await server.close();
    await state.close();
  }
});
it("HTTP MCP and REST share authorization and guest consent is CSRF protected", async () => {
  const port = await freePort();
  const g = createGateway({
    issuer: `http://127.0.0.1:${port}`,
    origins: ["http://localhost:5361"],
    development: true,
  });
  await g.listen(port);
  let client: Client | undefined;
  try {
    const c = await g.oauth.clientsStore.registerClient!({
      redirect_uris: ["http://localhost:8888/cb"],
      token_endpoint_auth_method: "none",
    });
    const verifier = "a".repeat(43);
    const params = {
      redirectUri: c.redirect_uris[0]!,
      resource: new URL(`http://127.0.0.1:${port}/mcp`),
      codeChallenge: createHash("sha256").update(verifier).digest("base64url"),
    };
    const tokens = await g.oauth.exchangeAuthorizationCode(
      c,
      g.oauth.issueCode(c, params),
      verifier,
      params.redirectUri,
      params.resource,
    );
    const headers = {
      Authorization: `Bearer ${tokens.access_token}`,
      "Content-Type": "application/json",
    };
    const consent = await fetch(`http://127.0.0.1:${port}/guest/consent`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "id=fake&csrf=fake&decision=approve",
    });
    expect(consent.status).toBe(403);
    const req = {
      version: 1,
      requestId: "r",
      sessionId: "s",
      targetId: "t",
      epoch: "e",
      operation: "forge.read",
      args: {},
    };
    expect(
      (
        await fetch(`http://127.0.0.1:${port}/api/v1/commands`, {
          method: "POST",
          headers,
          body: JSON.stringify(req),
        })
      ).status,
    ).toBe(200);
    const rest = await (
      await fetch(`http://127.0.0.1:${port}/api/v1/commands`, {
        method: "POST",
        headers,
        body: JSON.stringify(req),
      })
    ).json();
    expect(rest.code).toBe("NOT_PAIRED");
    client = new Client({ name: "http-test", version: "1" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
        requestInit: {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        },
      }),
    );
    const mcp = await client.callTool({
      name: "agent_request",
      arguments: req,
    });
    expect(mcp.structuredContent).toEqual(rest);
    expect(
      (
        await fetch(`http://127.0.0.1:${port}/api/v1/commands`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(req),
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await fetch(`http://127.0.0.1:${port}/api/v1/targets`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "http://evil.test",
          },
          body: JSON.stringify({
            surface: "forge-editor",
            name: "x",
            build: "x",
          }),
        })
      ).status,
    ).toBe(403);
  } finally {
    await client?.close();
    await g.close();
  }
});
