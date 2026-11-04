/**
 * The roller's step (MU2-8 of `docs/plans/2026-10-13-modern-ui-polish-and-overlay.md`; MU2-4's review F2, MU.R19): the
 * enabled option a select's step lands on, as the setup page's walker steps a native `select` with Left / Right
 * (`../startupNavigation`'s `adjust`). A browser adaptation (MU.R1).
 *
 * CX-26 (the console plan): the modern roller that also lived here -- the design system's `.cx-roller--select` over a
 * native select (`asRoller`, `rollerControl`, its pointer's step marks through `stepRoller`; shared/ds
 * `components.css` part H) -- is retired: its rows (the modern Settings and the loadout editor) went with CX-25 and
 * CX-LOADOUTS, and only its tests made one since. The console's own Options rollers (part G) are the console's.
 */

/**
 * The enabled option a step of `delta` lands on (MU2-8; the walker's and the step marks' one rule). On a value of the
 * list, its neighbour, the ends kept; on a value held in a disabled option (a card value off the original's values),
 * the nearest enabled value that way -- by number when every value is one, else by the list's order -- and with none
 * that way the nearest at all (the end on that side), as the console's `optStep` clamps (`src/console/grammar.ts`);
 * with nothing chosen, the first.
 */
export function rollerStep(select: HTMLSelectElement, delta: number): HTMLOptionElement | undefined {
  const all = Array.from(select.options);
  const options = all.filter((option) => !option.disabled);
  const at = options.findIndex((option) => option.value === select.value);
  const held = select.selectedIndex >= 0 ? all[select.selectedIndex] : undefined;
  if (at >= 0 || !held || !options.length) return options[Math.max(0, Math.min(options.length - 1, at + delta))];
  const numeric = all.every((option) => option.value.trim() !== '' && Number.isFinite(Number(option.value)));
  const key = (option: HTMLOptionElement): number => (numeric ? Number(option.value) : all.indexOf(option));
  const here = key(held);
  const ahead = options.filter((option) => (key(option) - here) * delta > 0);
  const pool = ahead.length ? ahead : options;
  return pool.reduce((best, option) => (Math.abs(key(option) - here) < Math.abs(key(best) - here) ? option : best));
}
