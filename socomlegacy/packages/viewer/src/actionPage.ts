import { surfaceMaterial } from '@s2u/scene';
import { actionRayDetail, type ActionRayDetail } from './equipment';
import { promptOfBitmap, type ActionPrompt } from './hud';
import { ACTION_TYPE_CODES, actionReachNote, type MapAction } from './mapActions';
import type { ClientEvent, ServerEvent } from './net/protocol';
import type { WorldState } from './worldState';

/**
 * The map's switches on the page (XR-04; socomlegacy/docs/research/213-crossroads-as-built.md s4, 171 s3-s4): the switch
 * under the reticle for the HUD's prompt and the action button -- Crossroads' `seal_callstrike_1` and
 * `terrorist_callstrike_1` -- the press sent to the room as an `action` event with the surface the aim struck, never run
 * here; and the room's `action` event played back as a presentation run of the same program (ruling PF.R26: its sounds
 * and effects, no node or valve changed -- the swap comes in the snapshot's `env`). The `./doorPage` precedent;
 * `main.ts` makes one (the wiring is the controller's: S27 s3 "wiring owed").
 *
 * - The pick is the game's (`actionRayDetail`, `FUN_005aa6e0`, then `actionReachNote`, `FUN_005aa240`
 *   D:L463830-463905): a use volume the aim looks through wins when it is nearer than the opaque hit, else the opaque
 *   hit; that node or a parent names the action, its valve not 99, the feet within its `range` of the struck point
 *   along the ground (strict, D:L463895). There is no aim cone. Here only a SWITCH record (`typeCode` 2): doors are
 *   `./doorPage`'s, the bomb's tents XR-05's. The ray is the reticle's optical axis (`WalkMode.lookAim`,
 *   `FUN_0029bc90`), not the shot's `fireAim` and not the pre-pass far: a wall-pushed eye leaves that far off the
 *   crosshair, and a thin lever is then hit for a frame or two.
 * - The original fires on the button's release and re-picks the context in reach then (`FUN_00594cf0` ->
 *   `FUN_00592d50`). It does not latch the target at press-down. The HUD samples once a frame (`sample`) for the
 *   prompt; the release casts again and sends nothing when that cast misses, the prompt still showing or not.
 * - Once a round: the program hides the switch (offset 264, research 213 s2.1), so the aim no longer strikes it and the
 *   prompt goes; the room refuses a second use (`used`).
 * - P8 (`SWITCH_PREDICT_ADAPTATION`): a player's own press is presented here at once, as the original's pressing console
 *   runs it, and the room's word settles it.
 */

/**
 * SWITCH_PREDICT_ADAPTATION (P8, the online-parity sweep's DMA-3, class G; research 213 s4; a network adaptation): the
 * original runs a switch's use on the pressing console -- the button's 0x2000 branch (`FUN_00592d50`, D:L452002-452022)
 * calls `FUN_002b44e0` (D:L156787-156865), which starts the action's program there and only logs the use to the net
 * (`FUN_002bb5b0`, D:L156852) -- the door's path (research 92 s1; P7's `DOOR_PREDICT_ADAPTATION`). The port's room is the
 * authority a round trip away, so the page presents its own press at once (`ActionPage.action`): the presentation run
 * the room's `action` event would start (`executeAction(valve, false, true)`, PF.R26: the sounds and the common set's
 * `call`s, no node or valve), a gate lever's slide (`GatePage.press`, `GATE_PREDICT_ADAPTATION`) and a crane control's
 * swap (`CranePage.press`, `CRANE_PREDICT_ADAPTATION`). The room's word settles it: its `action` event naming this seat
 * (`by`) for the action is this run's echo, run never again (and the use marked, the room's `used`; never a crane's,
 * which toggles all round); another seat's for the same action while this one waits is that press's, and the run
 * playing is now its presentation (ours will be refused); a snapshot acking a command past the press's
 * (`NetClient.acked`) with no echo, or one with no own body (a dead seat's: `Room.useAction` refuses 'not alive'), is a
 * refusal, and the run is dropped where it stands with every run it started, its fades put back
 * (`WorldState.dropTree`). No original: the original has no refusal
 * to run back. Its cost (the owner's Q7, the sweep's section 6): a refused press's sounds up to the room's word were
 * heard -- the press is predicted only where the page's own pick passed the reach gate (`actionReachNote`) -- and the
 * common effects it called are not taken back. A second press while one waits is sent and not predicted.
 */
export const SWITCH_PREDICT_ADAPTATION = 'predicted' as const;

/** What the page lends the switches. */
export interface ActionPageDeps {
  /** The page's world (the room's state off the wire; its grid the walk's hull), or null when none. */
  world(): WorldState | null;
  /** The walk's feet, or null when not walking. */
  feet(): [number, number, number] | null;
  /** The use prompt's ray (`WalkMode.lookAim`). The prompt and the press pick along it. */
  aim(): { eye: readonly number[]; far: readonly number[] } | null;
  /**
   * The match -- online, or offline through the loopback's Room: where the press goes; null when there is none. P8: `id`
   * is this seat's (the room's `action` event's `by`), `acked` the last command the room had run as of the newest
   * snapshot, null with no own body in it (`NetClient.acked`); either absent, a prediction waits for the echo.
   */
  net(): { role: string; send(ev: ClientEvent): void; lastSeq(): number; id?: number; acked?(): number | null } | null;
  /**
   * P8: a player's press on a gate lever (`GatePage.press`): true when the action is a gate's (its slide predicted there
   * when the leaf rests at an end). The room broadcasts no `action` for a lever, so the world runs nothing for it here.
   */
  gatePress?(action: number, seq: number): boolean;
  /** P8: a player's press on a crane control (`CranePage.press`): true when `valve` is a hook's (its swap predicted there). */
  cranePress?(valve: string, seq: number): boolean;
  /** Whether `valve` is a crane control's (`CranePage.owns`): a crane toggles all round, never marked used. */
  isCrane?(valve: string): boolean;
  /**
   * A press with no player match. Chain Reaction's lever pauses the page's own hooks there (`CranePage.toggleLocal`).
   * Absent, the press is not taken.
   */
  offline?(valve: string): boolean;
}

/** Dev-only (`?devmode`): `change` logs when the pick's reason changes, `frame` every sample, `off` is silent. */
export type ActionPickLog = 'off' | 'change' | 'frame';
let actionPickLog: ActionPickLog = 'off';
let actionPickLine = '';

export function setActionPickLog(mode: ActionPickLog): void {
  actionPickLog = mode;
  actionPickLine = '';
}

/** The switch under the reticle: its index in `MapMeta.actions`, its record, the surface struck. */
export interface ActionTarget {
  action: number;
  record: MapAction;
  surface: { path: string; point: [number, number, number] };
  /** LATER 305: the eye the pick was cast from (`aim().eye`), sent with the press. */
  eye?: [number, number, number];
}

export class ActionPage {
  /** For the hook: the last press and the last event played. */
  private last: { action: number; sent: boolean } | null = null;
  private played: { action: number; by: number; ran: boolean } | null = null;
  /**
   * P8 (`SWITCH_PREDICT_ADAPTATION`): the own press presented here and not yet settled by the room: its action, the
   * command the `action` event named, whether it is a crane's (never marked used), and whether another seat's press of
   * the same action has made the run playing that press's presentation (`covered`: not dropped on our refusal).
   */
  private pending: { action: number; seq: number; crane: boolean; covered: boolean; tree: object } | null = null;
  /** The switch the HUD last sampled. Null once a sample misses. */
  private shown: { target: ActionTarget } | null = null;
  /** Whether the HUD has sampled this page. Before that, a press uses the live ray. */
  private sampled = false;

  constructor(private readonly deps: ActionPageDeps) {}

  /** The switch the ray strikes within its reach, and the dev log's line for that cast (built only when the log is on). */
  private pickAt(aim: { eye: readonly number[]; far: readonly number[] } | null): { target: ActionTarget | null; line: () => string } {
    const world = this.deps.world(), feet = this.deps.feet();
    if (!world || !feet || !aim) return { target: null, line: () => '[action] no-aim hit=- action=- opaque=- switch=-' };
    const detail = actionRayDetail(world.grid, aim.eye, aim.far, world.meta.actions, (n) => surfaceMaterial(n, ''));
    if (!detail.pick) return { target: null, line: () => pickLine(detail, 'switch=-') };
    const note = actionReachNote(world.meta.actions, detail.pick, feet, (v) => world.valve(v));
    const record = note.record;
    const reach = (): string => (note.why === 'none' || !record ? 'switch=-'
      : note.why !== 'ok' ? `switch=${record.node} ${note.why}`
        : used ? `switch=${record.node} used`
        : record.typeCode !== ACTION_TYPE_CODES['SWITCH'] ? `switch=${record.node} type`
          : `switch=${record.node}`);
    // USED_SWITCH_PROMPT_ADAPTATION (the owner, 2026-11-08; a browser adaptation, FG.R2): a switch used this round (the
    // room's `used`, marked here on its echo) offers no prompt -- the disc's own need no rule (their program hides the
    // switch, research 171 s4), a Forge switch keeps its model.
    const used = !!record && note.why === 'ok' && world.actionUsed(world.meta.actions.indexOf(record));
    const target = note.why === 'ok' && record && record.typeCode === ACTION_TYPE_CODES['SWITCH'] && !used
      ? {
        action: world.meta.actions.indexOf(record), record,
        surface: { path: detail.pick.path, point: [detail.pick.point[0], detail.pick.point[1], detail.pick.point[2]] as [number, number, number] },
        eye: [aim.eye[0]!, aim.eye[1]!, aim.eye[2]!] as [number, number, number],
      }
      : null;
    return { target, line: () => pickLine(detail, reach()) };
  }

  /** The switch under the reticle now, or null. This is not what the prompt is showing: that is `sample`. */
  target(): ActionTarget | null {
    return this.pickAt(this.deps.aim()).target;
  }

  /**
   * One HUD sample (`mountActions`' prompt, after the camera). `on` false (not walking) clears it. A miss clears the
   * sample. The sample is the prompt's and the picker's (`armed`), never the press's: the release re-picks
   * (`action`, `FUN_00592d50`).
   */
  sample(on: boolean): void {
    this.sampled = true;
    this.settle();
    if (!on) { this.shown = null; return; }
    const aim = this.deps.aim();
    const got = this.pickAt(aim);
    this.shown = got.target && aim ? { target: got.target } : null;
    this.note(got.line);
  }

  /** `setActionPickLog`. One line, and under `change` only when the reason is not the last one printed. */
  private note(lineOf: () => string): void {
    if (actionPickLog === 'off') return;
    const line = lineOf();
    if (actionPickLog === 'change' && line === actionPickLine) return;
    actionPickLine = line;
    console.info(line);
  }

  /** The switch the prompt is showing: the last sample, or the live ray before the HUD has sampled. */
  armed(): boolean {
    if (this.target() !== null) return true;
    return this.sampled && this.shown !== null;
  }

  /** The latched prompt's bitmap, without casting again. */
  shownPrompt(): ActionPrompt | null {
    const t = this.shown?.target;
    return t ? promptOfBitmap(t.record.bitmap) ?? 'action' : null;
  }

  /** The HUD's prompt for the target: samples, then the record's `bitmap` (`action_x.tif`'s `action` otherwise). */
  prompt(): ActionPrompt | null {
    this.sample(true);
    return this.shownPrompt();
  }

  /**
   * The action button (`WalkMode.setActionFilter`): true when a switch took it. A player's press is asked of the room,
   * whose `action` event then plays it. With no player match, `offline` may take it (Chain Reaction's lever). A
   * loopback room is a player match: the press goes there, not through `offline`. The release re-picks
   * and sends only what that pick names. The release (`FUN_00594cf0` D:L453221-453222) calls `FUN_00592d50`, which on
   * the switch context (D:L452003) takes the record from the actor's pick then (`FUN_005aa240` D:L452004) and uses it
   * only when the pick names one (D:L452018). A miss jumps to the end (D:L452023): the sample still showing is never
   * sent, and no target is latched at press-down. What the walk does with a missed release is LATER 353. The room
   * judges the line from its own eyes (A5, LATER 139): the page sends none.
   */
  action(): boolean {
    const t = this.pickAt(this.deps.aim()).target;
    if (!t) return false;
    const net = this.deps.net();
    if (!net || net.role !== 'player') return this.deps.offline?.(t.record.valve) ?? false;
    // LATER 305: the eye the pick's aim ray left (the room adds it to its own eyes once it has held it to the camera's locus).
    net.send({ type: 'action', seq: net.lastSeq(), action: t.action, surface: t.surface, ...(t.eye ? { eye: t.eye } : {}) });
    this.last = { action: t.action, sent: true };
    this.predict(t, net.lastSeq(), net.id);                 // P8: the command the event named
    return true;
  }

  /**
   * P8 (`SWITCH_PREDICT_ADAPTATION`): the press just sent, presented here at once. A gate lever's slide is the gates'
   * (no world run: the room sends no `action` for it); a crane's swap is the hooks', and its program runs here as the
   * room's `action` event would run it; every other switch's program runs here as that event's presentation run.
   */
  private predict(t: ActionTarget, seq: number, id: number | undefined): void {
    this.settle();
    if (this.deps.gatePress?.(t.action, seq)) return;
    const crane = this.deps.cranePress?.(t.record.valve, seq) ?? false;
    const world = this.deps.world();
    if (this.pending || !world) return;                      // one waits for the room: this one is sent, not predicted
    const tree = {};                                         // every run this press starts (`WorldState.dropTree`)
    if (!world.executeAction(t.record.valve, false, true, tree)) return;
    this.pending = { action: t.action, seq, crane, covered: false, tree };
    this.played = { action: t.action, by: id ?? -1, ran: true };
  }

  /**
   * P8: the room's word on a pending press from the newest snapshot (`acked`): past the press's command with no echo,
   * or no own body (a dead seat's), the room refused it, and the run is dropped where it stands -- unless another's
   * press of the same action has made it that press's presentation. Called with each HUD sample and each press.
   */
  private settle(): void {
    const p = this.pending;
    if (!p) return;
    const net = this.deps.net();
    if (!net) { this.pending = null; return; }               // the match is gone: nothing will settle it
    if (!net.acked) return;
    const acked = net.acked();
    if (acked !== null && acked <= p.seq) return;            // not decided yet
    this.pending = null;
    if (!p.covered) this.deps.world()?.dropTree(p.tree);
  }

  /**
   * A room's event (`NetClient.on`): an `action` runs that action's program on the page's world as a presentation run
   * (`WorldState.executeAction(valve, false, true)`: its `SOUND`s through the world's sound hook, the common set's effects
   * through its `call` hook -- COMMON_EFFECT_CALL_READING -- no node or valve changed). Anything else is not this page's.
   */
  event(ev: ServerEvent): void {
    if (ev.type !== 'action') return;
    const world = this.deps.world(), record = world?.meta.actions[ev.action];
    if (!world || !record) return;
    const p = this.pending;
    if (p && p.action === ev.action) {
      const own = this.deps.net()?.id;
      if (own !== undefined && ev.by === own) {
        // P8: this seat's press, presented at the press -- the run playing (or played) is this event's, never run again.
        this.pending = null;
        if (!p.crane) world.markUsed(ev.action);   // the room's `used`: a crane's all round
        return;
      }
      p.covered = true;                                      // another's press of it: the run playing is that one's
    }
    this.played = { action: ev.action, by: ev.by, ran: world.executeAction(record.valve, false, true) };
    // Another seat's press marks the use here too (the room's `used`, as this seat's echo does): its prompt gone for all.
    if (!this.deps.isCrane?.(record.valve)) world.markUsed(ev.action);
  }

  /** For the hook: the target's node and prompt, the last press and the last event played. */
  stats(): { target: string | null; prompt: ActionPrompt | null; last: ActionPage['last']; played: ActionPage['played'] } {
    const t = this.sampled ? this.shown?.target ?? null : this.target();
    return { target: t?.record.node ?? null, prompt: t ? promptOfBitmap(t.record.bitmap) ?? 'action' : null, last: this.last && { ...this.last }, played: this.played && { ...this.played } };
  }
}

function pickLine(detail: ActionRayDetail, reach: string): string {
  return `[action] ${detail.why} hit=${detail.pick?.path ?? '-'} action=${detail.actionPath ?? '-'} opaque=${detail.opaquePath ?? '-'} ${reach}`;
}
