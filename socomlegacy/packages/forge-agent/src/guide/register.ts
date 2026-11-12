// AX-2 (a browser adaptation, product track; contract C5, plan item 7): registers the guide on an MCP server -- the
// agent_guide tool, one resource per topic, and the prompts. mcp.ts calls it once.
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GUIDE_PROMPTS, GUIDE_SUMMARIES, GUIDE_TOPICS, GUIDE_URI_PREFIX, guideIndex, guideText } from "./index.js";

export function registerGuide(server: McpServer): void {
  server.registerTool(
    "agent_guide",
    {
      description:
        "Read the guide: how to pair, build, test and picture a map, the coordinate conventions, every refusal and its way on, and the limits. No topic: the topic list and a short start.",
      inputSchema: { topic: z.string().max(64).optional() },
      annotations: { readOnlyHint: true },
    },
    async ({ topic }) => {
      if (topic === undefined || topic === "") return { content: [{ type: "text", text: guideIndex() }] };
      const text = guideText(topic);
      if (text === undefined)
        return {
          content: [{ type: "text", text: "No guide topic \"" + topic + "\". Topics: " + GUIDE_TOPICS.join(", ") + "." }],
          isError: true,
        };
      return { content: [{ type: "text", text }] };
    },
  );
  for (const topic of GUIDE_TOPICS) {
    const uri = GUIDE_URI_PREFIX + topic;
    server.registerResource(
      "guide-" + topic,
      uri,
      { title: "Guide: " + topic, description: GUIDE_SUMMARIES[topic], mimeType: "text/markdown" },
      async () => ({ contents: [{ uri, mimeType: "text/markdown", text: guideText(topic)! }] }),
    );
  }
  for (const prompt of GUIDE_PROMPTS) {
    const argsSchema = Object.fromEntries(
      prompt.args.map((a) => [a.name, a.required ? z.string().describe(a.description) : z.string().optional().describe(a.description)]),
    );
    server.registerPrompt(
      prompt.name,
      { title: prompt.title, description: prompt.description, argsSchema },
      async (args: Record<string, string | undefined>) => ({
        messages: [{ role: "user", content: { type: "text", text: prompt.render(args) } }],
      }),
    );
  }
}
