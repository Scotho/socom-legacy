import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { OPERATION_MANUAL, validateSchema, type JsonSchema, type ManualEntry } from "@s2u/forge-agent-protocol";

/**
 * AX-6 (plan item 6; a browser adaptation, product track, no original): typed MCP tools per area. Each tool's input
 * schema is generated from the operation manual (contract C1, `OPERATION_MANUAL`) -- an enum `operation` and, under
 * the args field, every operation's own schema (`anyOf`, each branch titled with the operations it serves), so a client
 * shows the fields natively. The SDK lists a top-level union as an empty object and some clients refuse a top-level
 * `oneOf`, so the operation-to-schema link is held by a refinement that runs `validateSchema` before dispatch and names
 * the field. Every call becomes the `agent_request` input it stands for and goes the same way (`state.command`):
 * implicit session (C2), "current" revisions, hints (C3), rate limits and receipts unchanged. `agent_request` stays (AX.R8).
 */
export const AREA_TOOL_NAMES = ["forge_read", "forge_edit", "forge_play", "testroom", "capture", "camera"] as const;
export type AreaToolName = (typeof AREA_TOOL_NAMES)[number];

/** Where one tool operation goes on the wire: the wire operation, and whether its args are wrapped as {operation, arguments}. */
interface Route { wire: string; nested: boolean; schema: JsonSchema }
export interface AreaToolSpec {
  name: AreaToolName;
  description: string;
  annotations: { readOnlyHint: boolean; destructiveHint?: boolean };
  /** "arguments" for forge_edit (as forge.edit names it), "args" elsewhere. */
  argsField?: "args" | "arguments";
  /** One wire operation and no `operation` field (capture): the args field is that operation's own schema. */
  single?: true;
  routes: Readonly<Record<string, Route>>;
  inputSchema: z.ZodType;
}

/**
 * The tool operations for these wire operations: a wrapper whose wire args take {operation, arguments} contributes its
 * nested operations instead of itself (`forge.edit`, `forge.input`, `testroom.input`, `testroom.settings`); any other
 * contributes itself (`testroom.map` takes its own fields {list | map...}, so it stays whole).
 */
function routesFor(manual: Readonly<Record<string, ManualEntry>>, wires: readonly string[]): Record<string, Route> {
  const routes: Record<string, Route> = {};
  const add = (name: string, route: Route) => {
    if (Object.hasOwn(routes, name)) throw new Error(`area tool operation ${name} is ambiguous`);
    routes[name] = route;
  };
  for (const wire of wires) {
    const entry = manual[wire];
    if (!entry) continue;
    if (entry.nested && Object.hasOwn(entry.args.properties ?? {}, "operation"))
      for (const [name, inner] of Object.entries(entry.nested)) add(name, { wire, nested: true, schema: inner.args });
    else add(wire, { wire, nested: false, schema: entry.args });
  }
  return routes;
}

const id = z.string().min(1).max(128);
/** agent_request's binding fields, each optional and filled by the gateway from the one paired session (C2). */
const binding = { requestId: id.optional(), sessionId: id.optional(), targetId: id.optional(), epoch: id.optional() };
const revision = z.union([z.number().int().nonnegative(), z.literal("current")]).optional();
const expectedRevision = revision.describe('The revision you last read, or "current"; needed by a mutation.');
/** REVIEW-1 4: a `refs` capture's refs live for one revision, so the capture carries the revision they were read at. */
const captureRevision = revision.describe('With view "refs": the revision the refs were read at (forge.read {section: "refs"}), or "current".');

/** Identical schemas share one titled branch (most edits take the same shapes), which keeps the tool list small. */
function branches(routes: Record<string, Route>): Record<string, unknown>[] {
  const groups = new Map<string, string[]>();
  for (const [name, route] of Object.entries(routes)) {
    const key = JSON.stringify(route.schema);
    groups.set(key, [...(groups.get(key) ?? []), name]);
  }
  return [...groups].map(([key, names]) => ({ title: names.join(" | "), ...(JSON.parse(key) as object) }));
}

function inputSchemaFor(routes: Record<string, Route>, argsField: "args" | "arguments" | undefined, mutation: boolean,
  single: boolean, revisionField: z.ZodType | undefined): z.ZodType {
  const names = Object.keys(routes) as [string, ...string[]];
  const shape: Record<string, z.ZodType> = { ...binding };
  if (argsField && single) {
    // REVIEW-1 4: one operation, so its schema is the args field's own (capture: view, refs, name, size).
    const only = Object.values(routes)[0]!;
    shape[argsField] = z
      .unknown()
      .optional()
      .meta({ description: `${only.wire}'s args ({} for the defaults).`, ...(JSON.parse(JSON.stringify(only.schema)) as object) });
  } else if (argsField) {
    shape.operation = z.enum(names);
    shape[argsField] = z
      .unknown()
      .optional()
      .meta({ description: "The operation's args; the branch titled with it is its schema ({} when it takes none).", anyOf: branches(routes) });
  }
  if (mutation) shape.expectedRevision = expectedRevision;
  else if (revisionField) shape.expectedRevision = revisionField;
  return z.object(shape).superRefine((value, ctx) => {
    if (!argsField) return;
    const route = single ? Object.values(routes)[0]! : routes[(value as { operation: string }).operation]!;
    try {
      validateSchema((value as Record<string, unknown>)[argsField] ?? {}, route.schema, argsField);
    } catch (e) {
      ctx.addIssue({ code: "custom", path: [argsField], message: (e as Error).message });
    }
  });
}

const GUIDE = "See agent_guide (topic start) for pairing, revisions and refusals; agent_request still takes any operation.";
interface Definition { name: AreaToolName; wires: (manual: Readonly<Record<string, ManualEntry>>) => string[]; argsField?: "args" | "arguments";
  single?: true; revision?: z.ZodType; description: string; annotations: AreaToolSpec["annotations"] }
const inArea = (area: ManualEntry["area"], keep: (name: string, e: ManualEntry) => boolean = () => true) =>
  (manual: Readonly<Record<string, ManualEntry>>) => Object.entries(manual).filter(([n, e]) => e.area === area && keep(n, e)).map(([n]) => n);
const SCENARIO_WIRES = ["scenario.start", "scenario.status", "scenario.cancel"] as const;
const DEFINITIONS: readonly Definition[] = [
  { name: "forge_read", wires: inArea("forge", (_, e) => !e.mutation), argsField: "args", annotations: { readOnlyHint: true },
    description: `Read and check the Forge layout in Build: one inspect operation with its args. ${GUIDE}` },
  { name: "forge_edit", wires: () => ["forge.edit"], argsField: "arguments", annotations: { readOnlyHint: false, destructiveHint: true },
    description: `Apply one Forge edit as one undo step: {operation: "piece.place", arguments: {...}, expectedRevision} (sent as forge.edit). ${GUIDE}` },
  { name: "forge_play", wires: inArea("play"), argsField: "args", annotations: { readOnlyHint: false, destructiveHint: false },
    description: `Private Forge Play: forge.play, one Play input (input.set, action.*...), play.stop or a scenario.*. ${GUIDE}` },
  // REVIEW-1 11: scenario.* serve the room as well as Forge Play, and the room's guide teaches them, so they route here too.
  { name: "testroom", wires: (manual) => [...inArea("testroom")(manual), ...SCENARIO_WIRES.filter((w) => Object.hasOwn(manual, w))],
    argsField: "args", annotations: { readOnlyHint: false, destructiveHint: false },
    description: `The solo test room: read, focus, load maps, teleport, one input, an instrument setting (camera.set, session.play) or a scenario.* (start, status, cancel). ${GUIDE}` },
  { name: "capture", wires: () => ["target.capture"], argsField: "args", single: true, revision: captureRevision, annotations: { readOnlyHint: true },
    description: `Capture the game canvas (no page UI) as an image, sent as target.capture: args {view?: current | top | refs | named, refs?, name?, size?: small | medium}; the presets move the camera and put it back. ${GUIDE}` },
  { name: "camera", wires: inArea("camera"), argsField: "args", annotations: { readOnlyHint: false, destructiveHint: false },
    description: `The agent's cinematic camera in Build and the solo room (view only): camera.shot, camera.stop, camera.status. ${GUIDE}` },
];

/** The six tools, built from `manual` (the published `OPERATION_MANUAL` unless a test passes another). */
export function areaToolSpecs(manual: Readonly<Record<string, ManualEntry>> = OPERATION_MANUAL): AreaToolSpec[] {
  return DEFINITIONS.map((d) => {
    const routes = routesFor(manual, d.wires(manual));
    const mutation = [...new Set(Object.values(routes).map((r) => r.wire))].some((wire) => manual[wire]!.mutation);
    return { name: d.name, description: d.description, annotations: d.annotations, ...(d.argsField ? { argsField: d.argsField } : {}),
      ...(d.single ? { single: true as const } : {}), routes, inputSchema: inputSchemaFor(routes, d.argsField, mutation, d.single === true, d.revision) };
  });
}

/** The `agent_request` input a tool call stands for (absent fields left absent for the gateway to fill). */
export function toAgentRequestInput(spec: AreaToolSpec, input: Record<string, unknown>): Record<string, unknown> {
  const { operation, args: _args, arguments: _arguments, ...rest } = input;
  const route = spec.argsField && !spec.single ? spec.routes[operation as string]! : Object.values(spec.routes)[0]!;
  const args = (spec.argsField ? input[spec.argsField] : undefined) ?? {};
  return { ...rest, operation: route.wire, args: route.nested ? { operation, arguments: args } : args };
}

/**
 * Registers the six tools. `request` is `agent_request`'s own path: it takes the same input and answers through the same
 * result shaping (so `capture` carries the MCP image block exactly as `agent_request` does).
 */
export function registerAreaTools(server: McpServer, request: (input: Record<string, unknown>) => Promise<CallToolResult>) {
  for (const spec of areaToolSpecs())
    server.registerTool(
      spec.name,
      { description: spec.description, inputSchema: spec.inputSchema as z.ZodObject, annotations: spec.annotations },
      async (input: Record<string, unknown>) => request(toAgentRequestInput(spec, input)),
    );
}
