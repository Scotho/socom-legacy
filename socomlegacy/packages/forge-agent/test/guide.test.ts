// AX-2 (a browser adaptation, product track): the agent guide and the MCP prompts (contract C5, plan items 2 and 7).
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { FORGE_OPERATIONS, LIMITS, OPERATIONS, REFUSAL_HINTS } from "@s2u/forge-agent-protocol";
import { createMcpServer, schema } from "../src/mcp.js";
import { joinText } from "../src/gateway.js";
import { GatewayState, PAIR_WAIT_SECONDS } from "../src/sessions.js";
import {
  GUIDE_TOPICS,
  GUIDE_URI_PREFIX,
  guideIndex,
  guideText,
  GUIDE_PROMPTS,
  REFUSAL_WAYS,
} from "../src/guide/index.js";

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));
const read = (path: string) => readFileSync(here(path), "utf8");

/** The page's Forge operation names: the protocol's `FORGE_OPERATIONS` (AX-1 moved the page's table there; viewer
 * `forge/agent/api.ts` `FORGE_AGENT_OPERATIONS` is that table). */
const forgeOperationNames = (): Set<string> => {
  const names = FORGE_OPERATIONS.map((o) => o.name as string);
  expect(names.length).toBeGreaterThan(80);
  return new Set(names);
};
/** The solo room's own operation names (viewer `testroom/agent/target.ts`, its schema table's keys). */
const testroomOperationNames = (): Set<string> => {
  const source = read("../../viewer/src/testroom/agent/target.ts");
  return new Set([...source.matchAll(/'([a-z][a-zA-Z]*(?:\.[a-zA-Z]+)*)': objectSchema\(/g)].map((m) => m[1]!));
};
/** Every source file the refusal table may cite. */
const sourceText = (): string => {
  const roots = [
    "../src",
    "../../forge-agent-protocol/src",
    "../../viewer/src/agent",
    "../../viewer/src/forge/agent",
    "../../viewer/src/forge/camera",
    "../../viewer/src/testroom/agent",
  ];
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) { if (name !== "guide") walk(path); }
      else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name)) out.push(readFileSync(path, "utf8"));
    }
  };
  for (const root of roots) walk(here(root));
  return out.join("\n");
};

const all = () => [guideIndex(), ...GUIDE_TOPICS.map((t) => guideText(t)!), ...GUIDE_PROMPTS.map((p) => p.render({}))];

let cleanup: (() => Promise<void>) | undefined;
afterEach(async () => { await cleanup?.(); cleanup = undefined; });
async function connect() {
  const state = new GatewayState({ origins: [] }),
    server = createMcpServer(state, "guest", "http://127.0.0.1:5370");
  const client = new Client({ name: "guide-test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  cleanup = async () => { await client.close(); await server.close(); await state.close(); };
  return client;
}
const textOf = (r: unknown) =>
  ((r as { content: { type: string; text?: string }[] }).content).filter((c) => c.type === "text").map((c) => c.text).join("\n");

describe("the guide's topics", () => {
  it("names the eight topics of contract C5", () => {
    expect([...GUIDE_TOPICS]).toEqual(["start", "forge-build", "forge-test", "testroom", "capture", "coordinates", "refusals", "limits"]);
  });
  it("resolves every topic as the agent_guide tool", async () => {
    const client = await connect();
    const tools = await client.listTools();
    const guide = tools.tools.find((t) => t.name === "agent_guide");
    expect(guide?.annotations?.readOnlyHint).toBe(true);
    for (const topic of GUIDE_TOPICS) {
      const r = await client.callTool({ name: "agent_guide", arguments: { topic } });
      expect(r.isError).toBeFalsy();
      expect(textOf(r)).toBe(guideText(topic));
    }
  });
  it("with no topic answers the topic list and a short start", async () => {
    const client = await connect();
    const r = await client.callTool({ name: "agent_guide", arguments: {} });
    const text = textOf(r);
    expect(text).toBe(guideIndex());
    for (const topic of GUIDE_TOPICS) expect(text).toContain(topic);
    expect(text).toContain("agent_pair");
  });
  it("refuses an unknown topic and lists the topics", async () => {
    const client = await connect();
    const r = await client.callTool({ name: "agent_guide", arguments: { topic: "nope" } });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain("forge-build");
  });
  it("serves every topic as a resource socom2legacy://guide/<topic>", async () => {
    const client = await connect();
    const listed = (await client.listResources()).resources.map((r) => r.uri);
    for (const topic of GUIDE_TOPICS) {
      const uri = `${GUIDE_URI_PREFIX}${topic}`;
      expect(uri).toBe(`socom2legacy://guide/${topic}`);
      expect(listed).toContain(uri);
      const r = await client.readResource({ uri });
      expect((r.contents[0] as { text: string }).text).toBe(guideText(topic));
    }
  });
  it("keeps each topic under 12 KB", () => {
    for (const text of [guideIndex(), ...GUIDE_TOPICS.map((t) => guideText(t)!)])
      expect(new TextEncoder().encode(text).length).toBeLessThan(12 * 1024);
  });
});

describe("every fact read from the code", () => {
  it("names only operations that exist (OPERATIONS, the page's Forge operations, the room's own)", () => {
    const known = new Set([...Object.keys(OPERATIONS), ...forgeOperationNames(), ...testroomOperationNames()]);
    const mentioned = new Set<string>();
    for (const text of all())
      for (const m of text.matchAll(/`([a-z][a-zA-Z]*(?:\.[a-zA-Z]+)+)(?=[`\s{(])/g)) mentioned.add(m[1]!);
    expect(mentioned.size).toBeGreaterThan(40);
    expect([...mentioned].filter((name) => !known.has(name))).toEqual([]);
  });
  it("quotes every LIMITS value exactly as LIMITS holds it", () => {
    const limits = guideText("limits")!;
    for (const [key, value] of Object.entries(LIMITS)) expect(limits).toContain(`\`${key}\` = ${value}`);
    for (const text of all())
      for (const m of text.matchAll(/`(\w+)` = (\d+)/g))
        if (Object.hasOwn(LIMITS, m[1]!)) expect(Number(m[2])).toBe(LIMITS[m[1] as keyof typeof LIMITS]);
  });
  it("teaches every refusal in its table, each code one the code base gives", () => {
    const refusals = guideText("refusals")!;
    const source = sourceText();
    expect(Object.keys(REFUSAL_WAYS).length).toBeGreaterThan(40);
    for (const [code, row] of Object.entries(REFUSAL_WAYS)) {
      expect(refusals).toContain(code);
      expect(row.way.length).toBeGreaterThan(10);
      expect(source.includes(`"${code}"`) || source.includes(`'${code}'`), code).toBe(true);
    }
  });
  it("teaches no code the agent's own table (protocol REFUSAL_HINTS) lacks: the hint the agent gets is there", () => {
    expect(Object.keys(REFUSAL_WAYS).filter((code) => !REFUSAL_HINTS[code])).toEqual([]);
  });
  it("tells a pending pairing to wait with agent_wait, never to repeat agent_pair (sessions.ts nextPending)", () => {
    const start = guideText("start")!;
    expect(start).toContain("agent_wait");
    expect(start).not.toMatch(/agent_pair again/);
    expect(start).toContain(`default ${PAIR_WAIT_SECONDS.default}, max ${PAIR_WAIT_SECONDS.max}`);
    expect(guideText("limits")!).toContain(`default ${PAIR_WAIT_SECONDS.default}, at most ${PAIR_WAIT_SECONDS.max}`);
  });
  it("says SESSION_AMBIGUOUS lists the sessions in data.sessions and takes a targetId or sessionId (sessions.ts implicit)", () => {
    expect(guideText("start")!).toMatch(/pass targetId or sessionId.*SESSION_AMBIGUOUS.*data\.sessions/);
  });
});

describe("REVIEW-1: where an agent would still have to guess", () => {
  it("5: CAPTURE_TOO_LARGE says retry with size \"small\" first, in the guide as in the hint", () => {
    expect(REFUSAL_WAYS.CAPTURE_TOO_LARGE!.way).toMatch(/size: ?"small"/);
    expect(guideText("capture")!).toMatch(/CAPTURE_TOO_LARGE[^.]*size "small"/);
  });
  it("9: an inner operation the wrapper does not admit is UNSUPPORTED_OPERATION with data.admitted, not PERMISSION_DENIED", () => {
    expect(guideText("forge-build")!).toMatch(/UNSUPPORTED_OPERATION[^.]*data\.admitted/);
    expect(guideText("forge-build")!).not.toMatch(/any other is refused PERMISSION_DENIED/);
    expect(REFUSAL_WAYS.UNSUPPORTED_OPERATION!.way).toMatch(/data\.admitted/);
    expect(REFUSAL_WAYS.PERMISSION_DENIED!.way).not.toMatch(/inner operation/);
    for (const code of ["MAP_ISSUES", "ABSENT_ASSET"]) expect(REFUSAL_WAYS[code], code).toBeDefined();
  });
  it("11: piece.place takes a forge.assets row's asset field, not its ref", () => {
    expect(guideText("forge-build")!).toMatch(/asset field, not its ref/);
  });
  it("11: CONNECTION_CLOSED checks a receipt only while the same session is paired, else re-reads state", () => {
    const way = REFUSAL_WAYS.CONNECTION_CLOSED!.way;
    expect(way).toMatch(/same session/);
    expect(way).toMatch(/request\.receipt/);
    expect(way).toMatch(/read the page's state again|target\.status/);
    expect(way).not.toMatch(/pair again, then check request\.receipt/);
  });
  it("13: a pairing wait is 45 s by default and 90 s at most; a client timeout means agent_wait", () => {
    expect({ ...PAIR_WAIT_SECONDS }).toEqual({ default: 45, min: 0, max: 90 });
    expect(guideText("start")!).toMatch(/times out[^.]*agent_wait/);
    expect(guideText("limits")!).toMatch(/times out[^.]*agent_wait/);
  });
  it("14: the capture permission's line says its presets move the camera and put it back, and end a running shot", () => {
    const line = guideText("start")!.split("\n").find((l) => l.startsWith("- capture: "))!;
    expect(line).toMatch(/move the camera/);
    expect(line).toMatch(/put it back/);
    expect(line).toMatch(/running camera shot/);
  });
  it("16: in Play, edits and camera shots are refused SURFACE_DENIED with retry.surface (the gateway's code), not PLAYING", () => {
    expect(guideText("forge-test")!).toMatch(/SURFACE_DENIED[^.]*retry\.surface/);
    expect(guideText("forge-test")!).not.toMatch(/Edits are refused PLAYING/);
    expect(guideText("capture")!).toMatch(/Play refuses SURFACE_DENIED/);
    expect(guideText("capture")!).not.toMatch(/\(Play refuses PLAYING\)/);
  });
});

describe("the prompts", () => {
  it("lists the four prompts with their arguments", async () => {
    const client = await connect();
    const prompts = (await client.listPrompts()).prompts;
    expect(prompts.map((p) => p.name).sort()).toEqual(["build-a-map", "camera-tour", "playtest-my-layout", "review-my-layout"]);
    expect(prompts.find((p) => p.name === "build-a-map")?.arguments).toEqual([expect.objectContaining({ name: "idea", required: true })]);
    expect(prompts.find((p) => p.name === "camera-tour")?.arguments).toEqual([expect.objectContaining({ name: "seconds", required: false })]);
  });
  it("renders each as a user message walking its guide topic", async () => {
    const client = await connect();
    const cases: [string, Record<string, string>, string][] = [
      ["build-a-map", { idea: "a sniper alley" }, "forge-build"],
      ["playtest-my-layout", {}, "forge-test"],
      ["review-my-layout", {}, "forge-build"],
      ["camera-tour", { seconds: "20" }, "capture"],
    ];
    for (const [name, args, topic] of cases) {
      const r = await client.getPrompt({ name, arguments: args });
      expect(r.messages).toHaveLength(1);
      expect(r.messages[0]!.role).toBe("user");
      const text = (r.messages[0]!.content as { text: string }).text;
      expect(text).toContain(`agent_guide`);
      expect(text).toContain(topic);
      for (const value of Object.values(args)) expect(text).toContain(value);
    }
    const build = await client.getPrompt({ name: "build-a-map", arguments: { idea: "x" } });
    expect((build.messages[0]!.content as { text: string }).text).toMatch(/ask the player before/i);
  });
});

describe("the server instructions", () => {
  it("say to call agent_guide first", async () => {
    const client = await connect();
    expect(client.getInstructions()).toMatch(/Call agent_guide first if you have not/);
  });
  it("name only tools that exist, as do the guide and the join link's words", async () => {
    const client = await connect();
    const tools = new Set((await client.listTools()).tools.map((t) => t.name));
    const state = new GatewayState({ origins: [] });
    const texts = [client.getInstructions() ?? "", schema(state, "http://127.0.0.1:5370").instructions, joinText("http://127.0.0.1:5370"), ...all()];
    await state.close();
    const named = new Set(texts.flatMap((t) => [...t.matchAll(/\bagent_[a-z]+\b/g)].map((m) => m[0])));
    expect(named.size).toBeGreaterThan(5);
    expect([...named].filter((n) => !tools.has(n))).toEqual([]);
  });
});

describe("AX-13: point at it", () => {
  it("forge-build teaches: ask the player to click where they want it, then call forge.focus and use its point", () => {
    const text = guideText("forge-build")!;
    expect(text).toContain("`forge.focus`");
    expect(text).toMatch(/click where they want it/);
    expect(text).toMatch(/one revision/);
  });
  it("testroom teaches testroom.focus: the player's feet, look and nearest objective", () => {
    const text = guideText("testroom")!;
    expect(text).toContain("`testroom.focus`");
    expect(text).toMatch(/nearest/);
  });
});
