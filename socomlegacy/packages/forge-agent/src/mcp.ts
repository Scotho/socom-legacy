import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { LIMITS, PERMISSIONS } from "@s2u/forge-agent-protocol";
import type { GatewayState } from "./sessions.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
export function schema(state: GatewayState, issuer: string) {
  return {
    version: 1,
    adaptation: true,
    help: `${issuer}/api/v1/schema`,
    mcp: `${issuer}/mcp`,
    commands: `${issuer}/api/v1/commands`,
    operations: state.operations,
    limits: LIMITS,
    permissions: PERMISSIONS,
    instructions:
      "Authorize as a guest, copy the invitation from your chosen page, request pairing, and approve it in that page. Tool authentication does not grant page access. Commands require explicit sessionId, targetId and epoch. Inspect operation metadata before calling agent_request; page parsers validate typed operation args.",
  };
}
const result = (value: unknown): CallToolResult => {
  const original = value as {
      data?: { image?: { mimeType: string; data: string } };
    },
    image = original?.data?.image;
  if (
    image &&
    typeof image.data === "string" &&
    ["image/png", "image/jpeg"].includes(image.mimeType)
  ) {
    const sanitized = {
      ...original,
      data: {
        ...original.data,
        image: {
          mimeType: image.mimeType,
          bytes: Math.floor((image.data.length * 3) / 4),
        },
      },
    };
    return {
      content: [
        { type: "text", text: JSON.stringify(sanitized) },
        { type: "image", mimeType: image.mimeType, data: image.data },
      ],
      structuredContent: sanitized,
    };
  }
  return {
    content: [{ type: "text", text: JSON.stringify(value) }],
    structuredContent: value as Record<string, unknown>,
  };
};
export function createMcpServer(
  state: GatewayState,
  principal: string,
  issuer: string,
  /** The requesting client's address, keying the per-address session budget. */
  address?: string,
) {
  const server = new McpServer(
    { name: "socom2legacy-forge-agent", version: "0.1.0" },
    { instructions: schema(state, issuer).instructions },
  );
  server.registerTool(
    "agent_status",
    {
      description:
        "List only your own pending and paired sessions. Bootstrap alone reveals no pages.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => result(state.status(principal)),
  );
  server.registerTool(
    "agent_capabilities",
    {
      description:
        "Discover the typed operation catalogue, permissions, bounds and setup help.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => result(schema(state, issuer)),
  );
  server.registerTool(
    "agent_pair",
    {
      description:
        "Request pairing with an invitation. The original page must explicitly approve the exact grants.",
      inputSchema: {
        invitation: z.string().min(1).max(128),
        permissions: z
          .array(
            z.enum([
              "inspect",
              "edit",
              "import",
              "test",
              "diagnose",
              "capture",
            ]),
          )
          .min(1)
          .max(6),
        clientName: z.string().max(80),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (args) => {
      try {
        return result(
          state.pair(
            principal,
            args.invitation,
            args.permissions,
            args.clientName,
            address,
          ),
        );
      } catch (e) {
        return { ...result({ code: (e as Error).message }), isError: true };
      }
    },
  );
  server.registerTool(
    "agent_disconnect",
    {
      description:
        "Revoke your own pairing and immediately close its RTC channel.",
      inputSchema: { sessionId: z.string().max(128) },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (args) => {
      try {
        return result(await state.disconnect(principal, args.sessionId));
      } catch (e) {
        return { ...result({ code: (e as Error).message }), isError: true };
      }
    },
  );
  server.registerTool(
    "agent_request",
    {
      description:
        "Dispatch an allowlisted typed operation. Discover its args/permissions using agent_capabilities. No arbitrary code, shell or HTTP.",
      inputSchema: {
        version: z.literal(1),
        requestId: z.string().min(1).max(128),
        sessionId: z.string().min(1).max(128),
        targetId: z.string().min(1).max(128),
        epoch: z.string().min(1).max(128),
        expectedRevision: z.number().int().nonnegative().optional(),
        operation: z.string().min(1).max(128),
        args: z.unknown(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    async (args) => result(await state.command(principal, args)),
  );
  return server;
}
