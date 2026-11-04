import type { DialogDesign } from '../dialog';
import { deliverDialogEvent } from '../movie/movieCommands';
import { modelNodes } from '../compositor/models';
import type { UiNode, UiScreen } from '../compositor/scene';
import type { UiBindingStart } from '../uiCommands';
import type { ValveStore } from '../valves';
import { ZAnimRuntime, type ZAnimHost, type ZAnimNode, type ZAnimNodeTree, type ZAnimRtSet, type ZAnimTraceEvent } from '../zanimRuntime';
import type { ShellScripts } from './menuShell';

/**
 * A built dialog's scripts as the dialog host drives them (PLAT-10; web research 115 §3 A3, §4.3 step 8): PLAT-07's
 * runtime over the dialog's **screen** -- so `menu_fade_up` writes the MENUFADER the compositor draws and the switch's
 * fade reads, and a script's `POPUP` node is the overlay `PopUpDialog` shows -- the dialog's `SCRIPT_LIBRARY` sets
 * started, its event records fired by kind through PLAT-21's `deliverDialogEvent` (`FUN_00367810` D:L263357-263396).
 *
 * Pure: no DOM, no viewer, no `tools/` (web sprint 6 package boundaries).
 */

/** Every node of a subtree in the walk's order (`findNode`'s: a level's children, then each child's own). */
function* nodesOf(root: UiNode): Generator<UiNode> {
  for (const c of root.children) yield c;
  for (const c of root.children) yield* nodesOf(c);
}

/**
 * The runtime's node tree over a screen: a script's node name resolved on the screen's tree (both planes, MENUFADER and
 * POPUP among them) and then among the `MODELS` entries' 3D nodes (MENU-02a: the roller and its item quads,
 * `compositor/models.ts`), each in `findNode`'s order, by its exact spelling (`NODE_NAME_MATCH_READING`: `FUN_00315d00`'s
 * `strcmp`); each 2D node seen
 * through one `ZAnimNode` view whose position x/y, scale x/y, opacity (+0x9c) and active flag (+0x5c bit 0, the
 * screen's `visible`: `NODE_ACTIVE_FLAG_READING`) are the screen node's own. The 2D node has no z or rotation; the view
 * keeps them for the scripts that write them.
 */
export function screenNodeTree(screen: UiScreen): ZAnimNodeTree {
  const views = new WeakMap<UiNode, ZAnimNode>();
  const view = (n: UiNode): ZAnimNode => {
    let v = views.get(n);
    if (v) return v;
    let z = 0, sz = 1;
    let rotation: [number, number, number, number] = [0, 0, 0, 1];
    v = {
      get position(): [number, number, number] { return [n.x, n.y, z]; },
      set position(p: [number, number, number]) { n.x = p[0]; n.y = p[1]; z = p[2]; },
      get rotation(): [number, number, number, number] { return rotation; },
      set rotation(q: [number, number, number, number]) { rotation = q; },
      get scale(): [number, number, number] { return [n.scale[0], n.scale[1], sz]; },
      set scale(s: [number, number, number]) { n.scale = [s[0], s[1]]; sz = s[2]; },
      get opacity(): number { return n.opacity; },
      set opacity(o: number) { n.opacity = o; },
      get active(): boolean { return n.visible; },
      set active(a: boolean) { n.visible = a; },
    };
    views.set(n, v);
    return v;
  };
  return {
    node(name: string): ZAnimNode | undefined {
      // NODE_NAME_MATCH_READING: the exact spelling only (dlgLadderLobby.rdr's foot `Medal_Blue` is not its legend's
      // shallower `medal_blue`).
      for (const n of nodesOf(screen.root)) if (n.name === name) return view(n);
      // The `MODELS` entries' nodes (`FUN_00366730`: the entry's, then the model's own under it), after the planes'.
      for (const m of screen.models) for (const n of modelNodes(m)) if (n.name === name) return n;
      return undefined;
    },
  };
}

export interface ScreenScriptsOptions {
  design: DialogDesign;
  screen: UiScreen;
  /** The zAnim archive's sets (`run/uizanim.zar`, which the menu state opens, research 115 §7). */
  sets: readonly ZAnimRtSet[];
  valves: ValveStore;
  /**
   * PLAT-08's `UiCommandHost`, with the screens' entries registered (`ScreenCommands.register`); its binding gates
   * (`bindingStart`, PLAT-28's browser adaptation) are asked before a binding's animation starts.
   */
  host: ZAnimHost & { bindingStart?(b: UiBindingStart): boolean };
  /** The dialog's name as it was opened (`SWITCHMENU`'s), for the binding gates; absent, ''. */
  dialog?: string;
  random?: () => number;
  trace?: (e: ZAnimTraceEvent) => void;
}

/**
 * INPUT_STRING_ARGUMENT_READING: what `FUN_00272480(ctx+0x18, 0)` (D:L119977-120006) answers -- the running
 * animation's first string input. A binding installs its `ARGUMENT` (or event text) on the instance; CALL flag 1
 * copies its caller's inputs (`FUN_0025d5c0` D:L107577-107592). Kept by the instance in the runtime, including guards,
 * rather than by animation name or the last event (research 363 §§1-2, reading pending review). [reading]
 */
export const INPUT_STRING_ARGUMENT_READING = 'the running instance\'s first string input' as const;

/**
 * BINDING_SET_SEARCH_READING: a binding's animation (`FUN_00367810` D:L263357-263396 -> `FUN_0026a250(0x414bb0, name,
 * 0)`) is looked up among the sets the menu state's context holds -- the dialog's own `SCRIPT_LIBRARY` sets, each
 * loaded from the archive into the context at build step 8 (`FUN_00268250` / `FUN_00267fa0`, then `FUN_0026c600`,
 * D:L263692-263731) and released at the unload -- the current set (`DAT_00414be4`, the last activated) first, then
 * the context's others in load order. This runtime holds every set of the archive at once, so the lookup here is
 * restricted to the dialog's sets, in `SCRIPT_LIBRARY` order: 169 animation names of `UIZANIM.ZAR` are defined in more
 * than one set (`PulseArrows` in `dlgCreateGame.rdr` before `dlgMenu.rdr`, `OnLoginRoomstart` in `dlgNetPlayerName.rdr`
 * before `dlgNetLogin.rdr`), and an archive-wide search found the earlier, inactive set's and was refused (MENU-01a,
 * research 138 §3). The order among the dialog's own sets is the reading (the current set is the last activated, which
 * no path dialog's duplicated names reach). The same reading seen from the binding's side as `LOADED_SETS_READING`
 * below (BOOT-04, research 139 §4), which realizes it: since their merge (2026-10-03) the runtime holds only the
 * dialog's loaded sets, so `find` and `start` search those alone and no per-binding restriction is needed. [reading]
 */
export const BINDING_SET_SEARCH_READING = 'the dialog\'s SCRIPT_LIBRARY sets, in order' as const;

/** `ShellScripts` with the runtime it drives, and the `SCRIPT_LIBRARY` names no set of the archive holds. */
export interface ScreenScripts extends ShellScripts {
  readonly runtime: ZAnimRuntime;
  readonly missing: readonly string[];
  /** A binding's animation started with its `ARGUMENT` (an event's here; a button's through PLAT-11); true when found. */
  startBinding(animation: string, argument: string | null): boolean;
  inputString(anim: string): string | null;
}

/**
 * LOADED_SETS_READING: the sets a dialog's scripts see are the ones its build loads -- each `SCRIPT_LIBRARY` name
 * opened from the archive into the context at 0x414bb0 (`FUN_00268250`, build step 8 D:L263692-263731) and activated
 * (`FUN_0026c600`), in the library's order, and released again by the unload (step 1) -- so `FUN_0026a250`'s search
 * (the current set -- `DAT_00414be4`, the last activated, so after a build the library's last -- first, then "every
 * other set in load order" from index 0, research 106 §8; this runtime's `find` walks from index 0, the deviation
 * `BINDING_SET_SEARCH_READING` records: no dialog of the disc defines a binding's name in two of its own sets) runs over
 * those alone. A name two
 * sets share (`do_onstart` in `dlgAfterErrorReboot.rdr`, set 29 of `RUN/UIZANIM.ZAR`, and in `dlgIntroScreen.rdr`, set
 * 35; `handle_memcard_error` in eleven) resolves to the loaded one. Until BOOT-04 the runtime was built over the whole
 * archive in its order, so `dlgIntroScreen`'s ONSTART found set 29's `do_onstart`, inactive, and the boot never left
 * its first dialog (research 139 §4). A library name the archive lacks is skipped (`missing`), as `FUN_0026a100`'s
 * null is (D:L263713). [reading]
 */
export const LOADED_SETS_READING = 'the SCRIPT_LIBRARY sets, in order' as const;

/** A dialog's scripts over its screen (`ShellScripts` for `MenuShellHost.build`). */
export function screenScripts(o: ScreenScriptsOptions): ScreenScripts {
  const byName = new Map(o.sets.map((s) => [s.name.toLowerCase(), s] as const));
  const loaded: ZAnimRtSet[] = [];
  const missing: string[] = [];
  for (const name of o.design.scripts) {
    const set = byName.get(name.toLowerCase());
    if (!set) missing.push(name);
    else if (!loaded.includes(set)) loaded.push(set);                              // LOADED_SETS_READING
  }
  const runtime = new ZAnimRuntime({
    sets: loaded, valves: o.valves, host: o.host, nodes: screenNodeTree(o.screen), random: o.random, trace: o.trace,
  });
  const own = loaded.map((s) => s.name);
  const startBinding = (animation: string, argument: string | null): boolean => {
    // PLAT-21's `runtimeEventStarter`, with the argument kept: found (`FUN_0026a250`) and started (`FUN_002734b0`); a
    // start refused (the animation already running, its set inactive) keeps the input the running one was started with.
    // A gate that takes the start (PLAT-28's hooks, a browser adaptation) leaves the animation unstarted: "found".
    if (o.host.bindingStart?.({ dialog: o.dialog ?? '', design: o.design, animation, argument })) return true;
    if (!runtime.find(animation)) return false;
    runtime.start(animation, undefined, argument);
    return true;
  };
  return {
    runtime, missing, startBinding,
    inputString: (anim) => runtime.inputString(anim),
    /** Step 8: each `SCRIPT_LIBRARY` set, in order, activated (`FUN_0026c600`: its auto-start animations start). */
    start: () => { for (const s of own) runtime.activate(s); },
    tick: (step) => runtime.tick(step),
    event: (kind) => deliverDialogEvent(o.design.bindings, kind, startBinding),
    stop: () => { for (const s of own) runtime.deactivate(s); },
  };
}
