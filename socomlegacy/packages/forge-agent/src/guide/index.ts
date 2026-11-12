// AX-2 (a browser adaptation, product track; contract C5): the agent guide -- `agent_guide {topic?}` and the resources
// socom2legacy://guide/<topic>. The text is bundled TypeScript (no file reads at runtime), one module per topic; every
// fact names, beside it, the file it is read from.
import { startTopic, START_SHORT } from "./start.js";
import { forgeBuildTopic } from "./forgeBuild.js";
import { forgeTestTopic } from "./forgeTest.js";
import { testroomTopic } from "./testroom.js";
import { captureTopic } from "./capture.js";
import { coordinatesTopic } from "./coordinates.js";
import { refusalsTopic } from "./refusals.js";
import { limitsTopic } from "./limits.js";

export { REFUSAL_WAYS, type RefusalWay } from "./refusals.js";
export { GUIDE_PROMPTS, type GuidePrompt } from "./prompts.js";
export { LIMIT_MEANINGS } from "./limits.js";

export const GUIDE_TOPICS = ["start", "forge-build", "forge-test", "testroom", "capture", "coordinates", "refusals", "limits"] as const;
export type GuideTopic = (typeof GUIDE_TOPICS)[number];
export const GUIDE_URI_PREFIX = "socom2legacy://guide/";

export const GUIDE_SUMMARIES: Readonly<Record<GuideTopic, string>> = Object.freeze({
  start: "what you connect to, the pairing order, agent_request's fields, what each permission allows",
  "forge-build": "read the layout and catalogue, query assets, check a placement, forge.edit, layout.batch, undo, check, save, export",
  "forge-test": "forge.play, forge.input, scenarios, play.stop",
  testroom: "the solo test room: read, map, teleport, input, settings, packs",
  capture: "target.capture and the camera: pose, look, focus, camera shots",
  coordinates: "units, y up, radians or degrees, refs living for one revision",
  refusals: "every refusal code and the way on",
  limits: "rate, queue, sizes, timeouts, the lifetimes of an invitation and a session",
});

const BUILDERS: Readonly<Record<GuideTopic, () => string>> = {
  start: startTopic,
  "forge-build": forgeBuildTopic,
  "forge-test": forgeTestTopic,
  testroom: testroomTopic,
  capture: captureTopic,
  coordinates: coordinatesTopic,
  refusals: refusalsTopic,
  limits: limitsTopic,
};
const TEXTS = new Map<GuideTopic, string>(GUIDE_TOPICS.map((t) => [t, BUILDERS[t]()]));

export const isGuideTopic = (topic: unknown): topic is GuideTopic =>
  typeof topic === "string" && (GUIDE_TOPICS as readonly string[]).includes(topic);

/** A topic's text; undefined for a name that is not a topic. */
export function guideText(topic: string): string | undefined {
  return isGuideTopic(topic) ? TEXTS.get(topic) : undefined;
}

/** The answer with no topic: the topic list and a short start. */
export function guideIndex(): string {
  return [
    "# SOCOM 2 Legacy agent guide",
    "",
    "Topics (agent_guide {topic}, or the resource " + GUIDE_URI_PREFIX + "<topic>):",
    ...GUIDE_TOPICS.map((t) => "- " + t + ": " + GUIDE_SUMMARIES[t]),
    "",
    "## Start",
    START_SHORT,
  ].join("\n");
}
