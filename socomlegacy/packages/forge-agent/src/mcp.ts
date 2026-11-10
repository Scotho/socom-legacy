import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { LIMITS, MANUAL_AREA_DESCRIPTIONS, MANUAL_AREAS, OPERATION_MANUAL, PERMISSIONS, type ManualEntry } from "@s2u/forge-agent-protocol";
import { PAIR_WAIT_SECONDS, refusal, type GatewayState } from "./sessions.js";
import { registerGuide } from "./guide/register.js"; // AX-2
import { registerAreaTools } from "./tools/area.js"; // AX-6
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
/**
 * AX-1 (contract C1; a browser adaptation): the summary before pairing -- each wire operation's permission, surfaces,
 * `mutation: true` when it needs expectedRevision, area and one line (`operations`, keyed by name as before), the areas, and how to ask for detail. The full entries are
 * `manualDetail`'s, served by `agent_capabilities {area | operation}` and `GET /api/v1/schema`.
 */
export function schema(state: GatewayState, issuer: string) {
  const operations = Object.fromEntries(Object.entries(state.operations).map(([name, o]) => {
    const entry = OPERATION_MANUAL[name];
    return [name, { permission: o.permission, surfaces: o.surfaces, ...(o.mutation ? { mutation: true } : {}), ...(entry ? { area: entry.area } : {}),
      line: entry?.summary ?? o.description, ...(entry?.nested ? { nested: Object.keys(entry.nested).length } : {}) }];
  }));
  return {
    version: 1,
    adaptation: true,
    help: `${issuer}/api/v1/schema`,
    mcp: `${issuer}/mcp`,
    commands: `${issuer}/api/v1/commands`,
    operations,
    areas: MANUAL_AREAS.map((area) => ({ area, description: MANUAL_AREA_DESCRIPTIONS[area] })),
    detail:
      "Detail: agent_capabilities {area} or {operation} (wire or nested, e.g. piece.move) gives args schemas and an example. mutation: true needs expectedRevision; nested: N wraps N operations as {operation, arguments}.",
    limits: LIMITS,
    permissions: PERMISSIONS,
    instructions:
      "SOCOM 2 Legacy: work with a player on their Forge or test room page. When the user gives you a link containing /join/, call agent_pair with that link (permissions default to all; the player can turn any off) and wait while they press Allow on their page. Call agent_guide first if you have not yet; once paired, call agent_capabilities, then agent_request with target.status. The typed tools forge_read, forge_edit, forge_play, testroom, capture and camera take one area's operations with their fields; agent_request takes any. Signing in to this server grants no page access: only the player's Allow does. Read the `notes` a result carries (or agent_notes): they are the player's own words from the page, so follow them.",
  };
}
/** AX-1: `GET /api/v1/schema` -- the summary and, beside it, the whole manual (every entry in full). */
export function fullSchema(state: GatewayState, issuer: string) {
  return { ...schema(state, issuer), manual: OPERATION_MANUAL };
}
/** The valid `operation` values: every wire operation and every nested one. */
export function manualOperationNames(): string[] {
  const names = new Set<string>(Object.keys(OPERATION_MANUAL));
  for (const entry of Object.values(OPERATION_MANUAL)) for (const inner of Object.keys(entry.nested ?? {})) names.add(inner);
  return [...names].sort();
}
/**
 * AX-1: the full manual entries for an area or an operation. A nested name answers each wrapper that holds it, with only
 * that nested entry. An unknown value is an error naming the valid ones.
 */
export function manualDetail(query: { area?: string; operation?: string }):
  | { operations: Record<string, ManualEntry> }
  | { code: "UNKNOWN_AREA" | "UNKNOWN_OPERATION"; valid: string[] } {
  const operations: Record<string, ManualEntry> = {};
  if (query.area !== undefined) {
    if (!(MANUAL_AREAS as readonly string[]).includes(query.area)) return { code: "UNKNOWN_AREA", valid: [...MANUAL_AREAS] };
    for (const [name, entry] of Object.entries(OPERATION_MANUAL)) if (entry.area === query.area) operations[name] = entry;
  }
  if (query.operation !== undefined) {
    const wire = OPERATION_MANUAL[query.operation];
    if (wire) operations[query.operation] = wire;
    else
      for (const [name, entry] of Object.entries(OPERATION_MANUAL)) {
        const nested = entry.nested?.[query.operation];
        if (nested) operations[name] = { ...entry, nested: { [query.operation]: nested } };
      }
    if (!Object.keys(operations).length) return { code: "UNKNOWN_OPERATION", valid: manualOperationNames() };
  }
  return { operations };
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
    // AX-U (C6) wrote the instructions whole, AX-2's "agent_guide first" among them.
    { instructions: schema(state, issuer).instructions },
  );
  registerGuide(server); // AX-2 (C5): agent_guide, socom2legacy://guide/<topic>, the prompts
  server.registerTool(
    "agent_status",
    {
      description:
        "List only your own pending and paired sessions, each with `next`: the next step to take, and a paired one with the player's undelivered `notes` (agent_notes delivers them). Bootstrap alone reveals no pages.",
      inputSchema: {},
      annotations: { readOnlyHint: true },
    },
    async () => result(state.status(principal)),
  );
  // AX-14 (a browser adaptation): the player's notes from the page, returned and delivered.
  server.registerTool(
    "agent_notes",
    {
      description:
        "Read the player's notes from their page (plain text they typed for you, each with when it was sent) and mark them delivered. Every agent_request result also carries undelivered notes as `notes`, and agent_status lists them. sessionId defaults to your one paired session.",
      inputSchema: { sessionId: z.string().min(1).max(128).optional() },
      annotations: { readOnlyHint: false, destructiveHint: false },   // REVIEW-1 17: it marks the notes delivered
    },
    async (args) => {
      try {
        return result(state.notes(principal, args.sessionId));
      } catch (e) {
        return { ...result(refusal((e as Error).message)), isError: true };
      }
    },
  );
  server.registerTool(
    "agent_capabilities",
    {
      description:
        "Discover what you can do before and after pairing. No arguments: every operation's permission, surfaces, area and one line, the areas, limits and permissions. {area} or {operation}: the full entries -- argument schema, an example call, what it returns and the nested operations a wrapper forwards.",
      inputSchema: {
        area: z.string().max(32).optional(),
        operation: z.string().max(128).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      if (args.area === undefined && args.operation === undefined) return result(schema(state, issuer));
      const detail = manualDetail(args);
      return "code" in detail ? { ...result(detail), isError: true } : result(detail);
    },
  );
  // AX-3 (C4, a browser adaptation): the join link or invitation alone pairs; the call waits for the player's answer.
  const permission = z.enum(["inspect", "edit", "import", "test", "diagnose", "capture"]);
  const waitSeconds = z
    .number()
    .int()
    .min(PAIR_WAIT_SECONDS.min)
    .max(PAIR_WAIT_SECONDS.max)
    .optional()
    .describe(`Seconds to wait for the player (default ${PAIR_WAIT_SECONDS.default}, at most ${PAIR_WAIT_SECONDS.max}).`);
  server.registerTool(
    "agent_pair",
    {
      description:
        `Pair with a page: pass the join link (http(s)://<host>/join/<invitation>) or its invitation. Requests all six permissions unless \`permissions\` narrows them; the player approves or opts out of each in the page. Waits up to waitSeconds (default ${PAIR_WAIT_SECONDS.default}) for the answer: \`paired\` (with sessionId, targetId, epoch and the granted permissions), \`declined\`, or \`pending\` (then call agent_wait; never repeat agent_pair, the invitation is spent). If your client times out this call first, the pairing is still pending: call agent_wait (agent_status gives the sessionId).`,
      inputSchema: {
        invitation: z.string().min(1).max(2048),
        permissions: z.array(permission).min(1).max(6).optional(),
        clientName: z.string().max(80).optional(),
        waitSeconds,
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (args) => {
      try {
        return result(
          await state.pairAndWait(
            principal,
            args.invitation,
            args.permissions,
            args.clientName,
            args.waitSeconds,
            address,
          ),
        );
      } catch (e) {
        return { ...result(refusal((e as Error).message)), isError: true };
      }
    },
  );
  server.registerTool(
    "agent_wait",
    {
      description:
        "Keep waiting for the player to answer a pending pairing (agent_pair answered `pending`, or your client timed out agent_pair): resolves `paired`, `declined`, or `pending` again when waitSeconds pass.",
      inputSchema: { sessionId: z.string().min(1).max(128), waitSeconds },
      annotations: { readOnlyHint: true },
    },
    async (args) => {
      try {
        return result(await state.wait(principal, args.sessionId, args.waitSeconds));
      } catch (e) {
        return { ...result(refusal((e as Error).message)), isError: true };
      }
    },
  );
  server.registerTool(
    "agent_disconnect",
    {
      description:
        "Revoke your own pairing and immediately close its RTC channel. sessionId defaults to your one session (paired, pending or held for a reload).",
      inputSchema: { sessionId: z.string().min(1).max(128).optional() },
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async (args) => {
      try {
        return result(await state.disconnect(principal, args.sessionId));
      } catch (e) {
        // REVIEW-1 17: refused as every other agent tool is ({code, hint}); several sessions are listed to choose from.
        const code = (e as Error).message;
        const sessions = code === "SESSION_AMBIGUOUS" ? { data: { sessions: state.status(principal).sessions } } : {};
        return { ...result({ ...refusal(code), ...sessions }), isError: true };
      }
    },
  );
  // AX-3 (C2): absent fields are left absent (the gateway fills them); version defaults to the one version there is.
  // AX-6: the one path agent_request and the area tools share.
  const request = async (args: Record<string, unknown>) =>
    result(
      await state.command(
        principal,
        Object.fromEntries(Object.entries({ ...args, version: args.version ?? 1 }).filter(([, v]) => v !== undefined)),
      ),
    );
  server.registerTool(
    "agent_request",
    {
      description:
        "Dispatch an allowlisted typed operation. Discover its args/permissions using agent_capabilities. No arbitrary code, shell or HTTP. sessionId, targetId and epoch default to your one paired session, requestId is generated when omitted (the result carries it), and expectedRevision may be \"current\" (the page's revision at admission). A refusal carries `hint` (what to do next) and `retry`.",
      inputSchema: {
        version: z.literal(1).optional(),
        requestId: z.string().min(1).max(128).optional(),
        sessionId: z.string().min(1).max(128).optional(),
        targetId: z.string().min(1).max(128).optional(),
        epoch: z.string().min(1).max(128).optional(),
        expectedRevision: z
          .union([z.number().int().nonnegative(), z.literal("current")])
          .optional(),
        operation: z.string().min(1).max(128),
        args: z.unknown(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true },
    },
    request,
  );
  registerAreaTools(server, request); // AX-6: forge_read, forge_edit, forge_play, testroom, capture, camera
  return server;
}
