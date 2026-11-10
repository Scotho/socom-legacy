// AX-2 (a browser adaptation, product track; plan item 7): the MCP prompts. Each renders one short user message that walks
// the agent through its guide topic: the steps, the checks, and asking the player before destructive edits.

export interface GuidePrompt {
  name: string;
  title: string;
  description: string;
  /** The prompt's arguments (MCP prompt arguments are strings). */
  args: readonly { name: string; description: string; required: boolean }[];
  render(args: Record<string, string | undefined>): string;
}

const firstPair =
  "If you are not paired yet, read agent_guide {topic: \"start\"} and pair with the join link I give you.";

export const GUIDE_PROMPTS: readonly GuidePrompt[] = [
  {
    name: "build-a-map",
    title: "Build a map",
    description: "Build a Forge layout from an idea, step by step, checking as you go.",
    args: [{ name: "idea", description: "What the map should be: its theme, size, game type or feel.", required: true }],
    render: ({ idea }) => [
      "Build a Forge layout in my page from this idea: " + (idea ?? "(ask me for the idea)") + ".",
      firstPair,
      "Read agent_guide {topic: \"forge-build\"} and agent_guide {topic: \"coordinates\"} first. Then:",
      "1. `target.status` and `forge.read` {section: \"metadata\"}: the base, the revision, what is there.",
      "2. `forge.assets` for the props you need; judge sizes from their bounds, not their names.",
      "3. Tell me your plan in a few lines and wait for my yes.",
      "4. Check each risky placement with `forge.placement`; place with `forge.edit`, grouping related edits in one " +
        "`layout.batch` so each step undoes at once. Carry the latest revision; re-read refs after each edit.",
      "5. `target.capture` after each step so we both see it; `forge.check`, then `forge.issues`, and fix what it finds.",
      "Ask the player before any destructive edit (layout.new, a base change, deleting what I placed, clearing rules).",
    ].join("\n"),
  },
  {
    name: "playtest-my-layout",
    title: "Playtest my layout",
    description: "Check the layout, start private Play, try it with normal inputs and report what happened.",
    args: [],
    render: () => [
      "Playtest my Forge layout.",
      firstPair,
      "Read agent_guide {topic: \"forge-test\"} first. Then:",
      "1. `forge.check` and `forge.issues`: Play refuses a layout with issues; tell me what they are before fixing any.",
      "2. Tell me you are starting Play, then `forge.play`; poll `target.status` until Play is ready.",
      "3. Try the layout with `forge.input` or a short `scenario.start` (observe steps say what actually happened); " +
        "`target.capture` at the moments that matter.",
      "4. `play.stop` when done, and report what worked, what did not, and the pictures.",
      "Ask the player before you change the layout to fix anything.",
    ].join("\n"),
  },
  {
    name: "review-my-layout",
    title: "Review my layout",
    description: "Read the layout and its check, picture it, and report findings without changing anything.",
    args: [],
    render: () => [
      "Review my Forge layout without changing it.",
      firstPair,
      "Read agent_guide {topic: \"forge-build\"} and agent_guide {topic: \"capture\"} first. Then:",
      "1. `target.status`, `forge.read` {section: \"metadata\"} and the sections that matter (spawns, pieces, refs).",
      "2. `forge.check` and `forge.issues`.",
      "3. Picture the key places: `forge.edit` with `camera.look`, then `target.capture`.",
      "4. Report spawns, cover, routes, objectives and every issue, each with its ref or position.",
      "Make no edit; ask the player before you change anything you recommend.",
    ].join("\n"),
  },
  {
    name: "camera-tour",
    title: "Camera tour",
    description: "Fly the camera around the map in one smooth shot and picture it.",
    args: [{ name: "seconds", description: "How long the tour lasts, in seconds (1..120).", required: false }],
    render: ({ seconds }) => [
      "Give me a camera tour of the map" + (seconds ? " lasting " + seconds + " seconds" : "") + ".",
      firstPair,
      "Read agent_guide {topic: \"capture\"} and agent_guide {topic: \"coordinates\"} first. Then:",
      "1. `target.status`, then the layout's refs (`forge.read` {section: \"refs\"}) or the room's objectives (`testroom.read`).",
      "2. Choose points around what matters, inside the map, looking no steeper than 89 degrees.",
      "3. One `camera.shot` {points, seconds" + (seconds ? ": " + seconds : "") + "}; `camera.status` to follow it, " +
        "`target.capture` along the way. `camera.stop` if I ask.",
      "The camera never changes the layout; still, ask the player before taking over their view.",
    ].join("\n"),
  },
];
