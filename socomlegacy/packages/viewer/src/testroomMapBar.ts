/**
 * TR-1, the test room's bar's map dropdown (the test room's maps plan, TR.R2; the owner's playtest, 2026-10-12: "Please
 * make /testroom have a dropdown for map selection."). A test instrument's adaptation, labelled as one, and nothing of the game
 * changes. The test room's keyboard is a development build's only (OT.R29, "Everywhere"); this module's key listeners read
 * no key as input -- they undo a key's change of the closed native select -- and are listed as not game input in
 * `test/keyboardGate.test.ts`.
 *
 * The settings panel's picker (`#maps`, `./ui` `onMapChange`) loads a map in place, and so leaves a LOCAL online session on
 * its old map; the bar's dropdown (`#map-bar`, on `#site-links` beside the panel and controls toggles) reloads the room
 * with `?map=<archive>` instead, every other parameter kept by `./shareUrl`'s rule (`writeShare`: `&fly` bare, `devmode`,
 * `server=`, `mp` as they were; the retired ones out), as `main.ts` `rememberMap` writes the map into the address.
 *
 * It lists the page's map list (`main.ts` `mapList`, `showMaps`) by the panel picker's label (`./mapOrder` `labelFor`),
 * the room's map selected, and follows the room's map as the panel's picker does (`Ui.select`). It shows only where the
 * page says a reload comes back to the same maps: the served tree open (`?devmode`), outside the replay's world (MU-11),
 * with a map list in -- a visitor's disc image is not kept over a reload (`./source`), so on a disc it stays hidden.
 *
 * The keys: the room's own key handlers skip a focused SELECT, so after the list closes without a choice the room's next
 * key (an arrow, or F, B, N, D, C) lands on the closed select, which moves and fires `change` within that key's keydown
 * task or, for a letter's first-letter search, its keypress task (Chromium and Gecko move it in keypress's default action,
 * an input event of its own). A change within the keydown's or the keypress's task is undone -- the room's map put back,
 * the focus given back to the page -- and nothing is chosen. An open list fires `change` only on its commit, a task of its own, so its keys (which Firefox may let reach
 * the page) and its committed choice are left alone: no open or closed state is needed, and no key is swallowed.
 */
import type { MapInfo } from '@s2u/archive';
import { labelFor } from './mapOrder';
import { writeShare } from './shareUrl';

/**
 * TR-2 (TR.R3; research 307 §3), the test instrument's words: what follows the label of a map the room's online server does
 * not play (its `GET /maps`, `./servedMaps`). The option's text, so its accessible name; the panel picker's player count
 * is put the same way (`./playersOnline` `mapSuffix`). A mark, never a removal: every served-tree map stays listed.
 */
export const NOT_SERVED_SUFFIX = ' · not on this server';

/** The dropdown's id, and its wrapper's (the element `hidden` is set on: it has no display rule of its own). */
export const MAP_BAR_ID = 'map-bar';
export const MAP_BAR_FIELD_ID = 'map-bar-field';

/** The query string the room reloads with on `archive`: `map=` written, everything else as `./shareUrl` keeps it. */
export function mapBarSearch(search: string, archive: string): string {
  return writeShare(search, { map: archive });
}

/** The address the room reloads on `archive`: the same path and hash, `mapBarSearch`'s query. */
export function mapBarHref(at: { pathname: string; search: string; hash: string }, archive: string): string {
  return `${at.pathname}${mapBarSearch(at.search, archive)}${at.hash}`;
}

/**
 * Reloads the room on `archive` (`mapBarHref` of the page's own address): the bar's choice, unless a caller gives another.
 * `replace`, not `assign`, as `./shareUrl` `updateAddress` writes the address without a history entry: Back never brings
 * back a cached page whose bar shows the new map over the old room.
 */
export function reloadOnMap(archive: string): void {
  const at = globalThis.location;
  at.replace(mapBarHref(at, archive));
}

/**
 * The keys that move a focused, closed select at once: the arrows, Home / End / Page Up / Page Down and a printable key
 * (its first-letter search). A change in such a key's keydown or keypress task is undone (`MapBar.wire`). Read on a
 * keydown and on a keypress alike: both carry `key` and the modifiers. Alt held (Alt+Down / Alt+Up open
 * the list), Ctrl or Meta held (a browser's chord), and Enter, Space, F4, Tab and Escape (open the list, commit it or
 * leave it) are not among them.
 */
export function movesClosedSelect(e: Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey'>): boolean {
  if (e.altKey || e.ctrlKey || e.metaKey) return false;
  if (/^(Arrow(Up|Down|Left|Right)|Home|End|PageUp|PageDown)$/.test(e.key)) return true;
  return e.key.length === 1 && e.key !== ' ';
}

/** The bar's dropdown: filled from the map list, following the room's map, shown only where `allowed` says. */
export class MapBar {
  private maps: readonly MapInfo[] = [];
  /** TR-2: the stems the online server plays (`markServed`), or null for not known (nothing marked). */
  private served: ReadonlySet<string> | null = null;
  private allowed: () => boolean = () => false;      // unwired, never shown
  /** The room's map, by archive: what `setMaps` selected or `follow` last set, put back over a keyed change. */
  private room = '';
  /** Within the keydown's or the keypress's task of a key that moves a closed select (`movesClosedSelect`): a change now is that key's. */
  private keyed = false;

  private constructor(private readonly select: HTMLSelectElement, private readonly field: HTMLElement) {}

  /** The page's dropdown, or null on a page without it. */
  static find(doc: Document): MapBar | null {
    const select = doc.getElementById(MAP_BAR_ID);
    const field = doc.getElementById(MAP_BAR_FIELD_ID);
    return select instanceof HTMLSelectElement && field ? new MapBar(select, field) : null;
  }

  /** The map list (the panel picker's, in its order), `selected` (a path) the room's map. */
  setMaps(maps: readonly MapInfo[], selected: string | null): void {
    this.maps = maps;
    this.select.replaceChildren(...maps.map((m) => {
      const option = document.createElement('option');
      option.value = m.archive;
      option.textContent = this.label(m);
      option.selected = m.path === selected;
      return option;
    }));
    this.room = maps.find((m) => m.path === selected)?.archive ?? this.select.value;
    this.refresh();
  }

  /**
   * TR-2: the stems the room's online server plays (uppercase, `./servedMaps`), or null when it is not known -- no server,
   * no answer, an older server without `/maps`: then nothing is marked (TR-1's bar). A map not among them keeps its place
   * and its value, its label followed by `NOT_SERVED_SUFFIX`; the selection and the choice are untouched.
   */
  markServed(stems: readonly string[] | null): void {
    this.served = stems ? new Set(stems.map((s) => s.toUpperCase())) : null;
    for (const option of this.select.options) {
      const m = this.maps.find((x) => x.archive === option.value);
      if (!m) continue;
      const text = this.label(m);
      if (option.textContent !== text) option.textContent = text;
    }
  }

  /** A map's label: the panel picker's (`labelFor`), marked when the online server does not play it. */
  private label(m: MapInfo): string {
    return labelFor(m) + (this.served && !this.served.has(m.archive.toUpperCase()) ? NOT_SERVED_SUFFIX : '');
  }

  /** The room's map, by its path: the bar shows it. */
  follow(path: string): void {
    const archive = this.maps.find((m) => m.path === path)?.archive;
    if (archive) this.select.value = this.room = archive;
  }

  /** Shown while `allowed()` holds and a list is in; a choice hands its archive to `choose` (the page reloads on it). */
  wire(allowed: () => boolean, choose: (archive: string) => void): void {
    this.allowed = allowed;
    this.select.addEventListener('change', () => {
      if (this.keyed) {                                // a closed select moved by the room's key: undone, nothing chosen
        this.keyed = false;
        this.select.value = this.room;
        this.select.blur();                            // the next key is the room's
        return;
      }
      const archive = this.select.value;
      if (archive && this.allowed()) choose(archive);
    });
    // Marked for the keydown's task and again for the keypress's (a letter's search moves the select in keypress's
    // default action, which may be a task of its own); cleared at each task's end, or on the keyup. An open list's
    // commit comes later, unmarked.
    this.select.addEventListener('keydown', (e) => {
      this.keyed = movesClosedSelect(e);
      if (this.keyed) setTimeout(() => { this.keyed = false; }, 0);
    });
    this.select.addEventListener('keypress', (e) => {
      if (!movesClosedSelect(e)) return;
      this.keyed = true;
      setTimeout(() => { this.keyed = false; }, 0);
    });
    this.select.addEventListener('keyup', () => { this.keyed = false; });
    this.refresh();
  }

  private refresh(): void {
    this.field.hidden = !(this.maps.length > 0 && this.allowed());
  }
}
