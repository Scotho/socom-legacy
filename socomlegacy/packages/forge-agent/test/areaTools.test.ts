import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { OPERATION_MANUAL, PERMISSIONS, type AgentRequest, type AgentResult, type ManualEntry, type Surface } from "@s2u/forge-agent-protocol";
import { GatewayState, type PagePeer } from "../src/sessions.js";
import { createMcpServer } from "../src/mcp.js";
import { AREA_TOOL_NAMES, areaToolSpecs } from "../src/tools/area.js";

// AX-6 (plan item 6; a browser adaptation, product track): typed MCP tools per area, generated from the manual (C1).
const ORIGIN = "http://localhost:5361";
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]).toString("base64");

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});
async function rig(surface: Surface = "forge-editor") {
  const seen: AgentRequest[] = [];
  let n = 0;
  const state = new GatewayState({
    origins: [ORIGIN],
    random: () => `rnd${++n}`.padEnd(22, "x"),
    peerFactory: () =>
      ({
        offer: async () => "",
        answer: async () => {},
        ice: async () => {},
        close: async () => {},
        request: async (r): Promise<AgentResult> => {
          seen.push(r);
          return r.operation === "target.capture"
            ? { requestId: r.requestId, revision: 3, outcome: "ok", data: { image: { mimeType: "image/png", data: PNG } } }
            : { requestId: r.requestId, revision: 3, outcome: "ok" };
        },
      }) satisfies PagePeer,
  });
  const p = state.register(ORIGIN, { surface, name: "Forge", build: "test" });
  state.attach(ORIGIN, p.pageToken, () => {});
  const pair = state.pair("a", p.invitation, [...PERMISSIONS], "agent");
  await state.signal(p.targetId, { type: "approve", pendingId: pair.pendingId, permissions: [...PERMISSIONS] });
  const server = createMcpServer(state, "a", "http://127.0.0.1:5360");
  const client = new Client({ name: "ax6", version: "1" });
  const [x, y] = InMemoryTransport.createLinkedPair();
  await server.connect(x);
  await client.connect(y);
  cleanup = async () => {
    await client.close();
    await server.close();
    await state.close();
  };
  return { client, seen };
}
const json = (tool: string, manual: Readonly<Record<string, ManualEntry>> = OPERATION_MANUAL) =>
  z.toJSONSchema(areaToolSpecs(manual).find((s) => s.name === tool)!.inputSchema, { io: "input" }) as {
    properties: Record<string, { enum?: string[]; anyOf?: { title: string }[] }>;
  };
const textOf = (r: unknown) =>
  (r as { content: { type: string; text?: string }[] }).content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
/** The request the page saw, without the requestId the gateway generated for each call. */
const sansId = (r: AgentRequest) => ({ ...r, requestId: undefined });

describe("AX-6: the area tools' schemas come from the manual", () => {
  it("names the six tools", () => {
    expect([...AREA_TOOL_NAMES]).toEqual(["forge_read", "forge_edit", "forge_play", "testroom", "capture", "camera"]);
    expect(areaToolSpecs().map((s) => s.name)).toEqual([...AREA_TOOL_NAMES]);
  });
  it("forge_edit's operations are forge.edit's nested ones and each one's schema is the manual's", () => {
    const schema = json("forge_edit");
    const nested = OPERATION_MANUAL["forge.edit"]!.nested!;
    expect(schema.properties.operation!.enum).toEqual(Object.keys(nested));
    const branches = schema.properties.arguments!.anyOf as ({ title: string } & Record<string, unknown>)[];
    for (const [name, entry] of Object.entries(nested)) {
      const branch = branches.find((b) => b.title.split(" | ").includes(name));
      expect(branch, name).toBeDefined();
      const { title: _title, ...rest } = branch!;
      expect(rest).toEqual(JSON.parse(JSON.stringify(entry.args)));
    }
  });
  it("the other tools cover their areas: forge reads, play with forge.input's nested ones, the room with its wrappers' nested ones", () => {
    const ops = (tool: string) => json(tool).properties.operation!.enum!;
    expect(ops("forge_read")).toEqual(
      Object.entries(OPERATION_MANUAL).filter(([, e]) => e.area === "forge" && !e.mutation).map(([n]) => n),
    );
    expect(ops("forge_play")).toEqual(["forge.play", ...Object.keys(OPERATION_MANUAL["forge.input"]!.nested!), "play.stop", "scenario.start", "scenario.status", "scenario.cancel"]);
    expect(ops("testroom")).toEqual([
      "testroom.read",
      "testroom.map",
      "testroom.teleport",
      ...Object.keys(OPERATION_MANUAL["testroom.input"]!.nested!),
      ...Object.keys(OPERATION_MANUAL["testroom.settings"]!.nested!),
      "testroom.focus",
      // REVIEW-1 11: the room's scenarios are the room tool's too (the room's guide teaches them).
      "scenario.start",
      "scenario.status",
      "scenario.cancel",
    ]);
    expect(areaToolSpecs().find((s) => s.name === "testroom")!.description).toContain("scenario.*");
    expect(ops("camera")).toEqual(["camera.shot", "camera.stop", "camera.status"]);
    expect(json("capture").properties.operation).toBeUndefined();
  });
  it("REVIEW-1 4: capture's args field is target.capture's own schema, with expectedRevision for view refs", () => {
    const schema = json("capture") as { properties: Record<string, Record<string, unknown>> };
    const { description: _d, ...args } = schema.properties.args!;
    expect(args).toEqual(JSON.parse(JSON.stringify(OPERATION_MANUAL["target.capture"]!.args)));
    expect(Object.keys((args as { properties: object }).properties)).toEqual(["view", "refs", "name", "size"]);
    expect(schema.properties.expectedRevision).toBeDefined();
  });
  it("a manual edit changes the generated schema (no hand copy)", () => {
    const edit = OPERATION_MANUAL["forge.edit"]!;
    const manual = {
      ...OPERATION_MANUAL,
      "forge.edit": {
        ...edit,
        nested: { ...edit.nested, "piece.zap": { permission: "edit" as const, description: "x", args: { type: "object", properties: { zap: { type: "boolean" } } }, example: {} } },
      },
      "camera.stop": { ...OPERATION_MANUAL["camera.stop"]!, args: { type: "object", properties: { why: { type: "string", maxLength: 9 } } } },
    } satisfies Record<string, ManualEntry>;
    const edited = json("forge_edit", manual);
    expect(edited.properties.operation!.enum).toContain("piece.zap");
    expect(JSON.stringify(edited.properties.arguments)).toContain('"zap"');
    expect(JSON.stringify(json("forge_edit").properties.arguments)).not.toContain('"zap"');
    expect(JSON.stringify(json("camera", manual).properties.args)).toContain('"why"');
  });
});

describe("AX-6: the area tools dispatch as agent_request does", () => {
  it("forge_edit {operation, arguments} reaches the page as agent_request's forge.edit {operation, arguments}", async () => {
    const { client, seen } = await rig();
    const example = OPERATION_MANUAL["forge.edit"]!.nested!["piece.move"]!.example;
    const typed = await client.callTool({ name: "forge_edit", arguments: { operation: "piece.move", arguments: example, expectedRevision: "current" } });
    expect(typed.isError).toBeFalsy();
    expect(typed.structuredContent).toMatchObject({ outcome: "ok" });
    await client.callTool({
      name: "agent_request",
      arguments: { operation: "forge.edit", args: { operation: "piece.move", arguments: example }, expectedRevision: "current" },
    });
    expect(seen).toHaveLength(2);
    expect(sansId(seen[0]!)).toEqual(sansId(seen[1]!));
    expect(seen[0]!.requestId).toMatch(/^gw-/);
  });
  it("forge_read and camera pass args as they are; a given requestId is kept", async () => {
    const { client, seen } = await rig();
    await client.callTool({ name: "forge_read", arguments: { operation: "forge.read", args: { section: "refs" }, requestId: "r-1" } });
    await client.callTool({ name: "agent_request", arguments: { operation: "forge.read", args: { section: "refs" }, requestId: "r-1" } });
    await client.callTool({ name: "camera", arguments: { operation: "camera.status" } });
    await client.callTool({ name: "agent_request", arguments: { operation: "camera.status", args: {} } });
    expect(seen[0]).toEqual(seen[1]);
    expect(sansId(seen[2]!)).toEqual(sansId(seen[3]!));
  });
  it("forge_play's nested input reaches forge.input {operation, arguments}", async () => {
    const { client, seen } = await rig("forge-play");
    const example = OPERATION_MANUAL["forge.input"]!.nested!["input.set"]!.example;
    await client.callTool({ name: "forge_play", arguments: { operation: "input.set", args: example, expectedRevision: "current" } });
    await client.callTool({
      name: "agent_request",
      arguments: { operation: "forge.input", args: { operation: "input.set", arguments: example }, expectedRevision: "current" },
    });
    expect(seen).toHaveLength(2);
    expect(sansId(seen[0]!)).toEqual(sansId(seen[1]!));
  });
  it("testroom's nested settings reach testroom.settings; testroom.map passes its own fields", async () => {
    const { client, seen } = await rig("testroom-solo");
    await client.callTool({ name: "testroom", arguments: { operation: "session.play", args: { on: true }, expectedRevision: "current" } });
    await client.callTool({
      name: "agent_request",
      arguments: { operation: "testroom.settings", args: { operation: "session.play", arguments: { on: true } }, expectedRevision: "current" },
    });
    await client.callTool({ name: "testroom", arguments: { operation: "testroom.map", args: { list: true }, expectedRevision: "current" } });
    await client.callTool({ name: "agent_request", arguments: { operation: "testroom.map", args: { list: true }, expectedRevision: "current" } });
    expect(seen).toHaveLength(4);
    expect(sansId(seen[0]!)).toEqual(sansId(seen[1]!));
    expect(sansId(seen[2]!)).toEqual(sansId(seen[3]!));
  });
  it("refuses an invalid call before dispatch, naming the field", async () => {
    const { client, seen } = await rig();
    const example = OPERATION_MANUAL["forge.edit"]!.nested!["piece.move"]!.example as object;
    const bad = await client.callTool({ name: "forge_edit", arguments: { operation: "piece.move", arguments: { ...example, bogus: 1 }, expectedRevision: 3 } });
    expect(bad.isError).toBe(true);
    expect(textOf(bad)).toContain("arguments.bogus");
    const missing = await client.callTool({ name: "camera", arguments: { operation: "camera.shot", args: {} } });
    expect(missing.isError).toBe(true);
    expect(textOf(missing)).toContain("args.points");
    const unknown = await client.callTool({ name: "forge_read", arguments: { operation: "forge.edit", args: {} } });
    expect(unknown.isError).toBe(true);
    expect(textOf(unknown)).toContain("operation");
    expect(seen).toHaveLength(0);
  });
  it("capture returns the MCP image block exactly as agent_request does", async () => {
    const { client, seen } = await rig();
    const typed = await client.callTool({ name: "capture", arguments: {} });
    const generic = await client.callTool({ name: "agent_request", arguments: { operation: "target.capture", args: {} } });
    expect(seen.map((r) => r.operation)).toEqual(["target.capture", "target.capture"]);
    const image = (r: unknown) => (r as { content: { type: string }[] }).content.find((c) => c.type === "image");
    expect(image(typed)).toEqual({ type: "image", mimeType: "image/png", data: PNG });
    expect(image(typed)).toEqual(image(generic));
  });
  it("REVIEW-1 4: capture's args reach the wire: {view: top, size: small}, and refs with their revision", async () => {
    const { client, seen } = await rig();
    const top = await client.callTool({ name: "capture", arguments: { args: { view: "top", size: "small" } } });
    expect(top.isError).toBeFalsy();
    expect(seen[0]!.operation).toBe("target.capture");
    expect(seen[0]!.args).toEqual({ view: "top", size: "small" });
    await client.callTool({ name: "capture", arguments: { args: { view: "refs", refs: ["piece:1"] }, expectedRevision: 3 } });
    expect(seen[1]!.args).toEqual({ view: "refs", refs: ["piece:1"] });
    expect(seen[1]!.expectedRevision).toBe(3);
    const bad = await client.callTool({ name: "capture", arguments: { args: { view: "sideways" } } });
    expect(bad.isError).toBe(true);
    expect(textOf(bad)).toContain("args.view");
    expect(seen).toHaveLength(2);
  });
});

describe("AX-6: the tool list", () => {
  it("lists the area tools with their annotations, under ~40 KB in all", async () => {
    const { client } = await rig();
    const { tools } = await client.listTools();
    for (const name of AREA_TOOL_NAMES) expect(tools.map((t) => t.name)).toContain(name);
    expect(tools.map((t) => t.name)).toContain("agent_request");
    const tool = (name: string) => tools.find((t) => t.name === name)!;
    expect(tool("forge_read").annotations?.readOnlyHint).toBe(true);
    expect(tool("forge_edit").annotations?.destructiveHint).toBe(true);
    expect((tool("forge_edit").inputSchema.properties as Record<string, { enum?: string[] }>).operation!.enum).toContain("piece.place");
    const listed = tool("forge_edit").inputSchema.properties as Record<string, { anyOf?: { title: string }[] }>;
    expect(listed.arguments!.anyOf!.some((b) => b.title.split(" | ").includes("piece.place"))).toBe(true);
    expect(tool("capture").inputSchema.type).toBe("object");
    for (const name of AREA_TOOL_NAMES) expect(tool(name).description).toContain("agent_guide");
    expect(JSON.stringify(tools).length).toBeLessThan(40 * 1024);
  });
});
