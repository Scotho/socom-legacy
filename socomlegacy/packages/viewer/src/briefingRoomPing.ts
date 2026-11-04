import { ListboxWidget, WORLD_OF_SOCOM, layoutText, type DialogDesign, type DialogPartsHost, type DialogRecord, type UiClip, type UiDrawItem, type UiVarValue } from '@s2u/ui';

/**
 * Browser adaptation (MLS.R4 as OT.R84 supersedes it; LATER 455): PING is each briefing room's own round trip from the
 * page to the door of the host its games are placed on (`./doorPing.ts` `timeDoorPing`, `GET <door>/ping`), looked up by
 * the row's drawn name (its first value, `roomListRows`); a room whose host's door is not known keeps the room list
 * request's own elapsed time to the lobby service, as before. `--` is unknown. It is client metadata, never a channel
 * record. `ping` is one number for every row, or a lookup by name.
 */
export function roomRowsWithPing(rows: readonly UiVarValue[], ping: number | null | ((name: string) => number | null)): UiVarValue[] {
  const cell = (ms: number | null): UiVarValue => ({ type: 'string', value: ms === null ? '--' : String(ms) });
  const one = typeof ping === 'function' ? null : cell(ping);
  return rows.map((row) => {
    if (row.type !== 'array') return row;
    const name = row.value[0]!;
    const shown = one ?? cell((ping as (name: string) => number | null)(name.type === 'string' ? name.value : ''));
    return { type: 'array', value: [name, shown, ...row.value.slice(1)] };
  });
}

/**
 * Adapt the decoded top-level ROOMLIST only. Copy changed records instead of editing the cached disc design;
 * all native fonts, row bindings, highlight artwork, table bounds and four medal columns remain the disc's.
 */
export function briefingRoomPingDesign(design: DialogDesign): DialogDesign {
  const list = design.controls.find((c) => c.name === 'ROOMLIST');
  const players = design.objects.find((r) => r.name === 'NumberOfPlayers');
  if (list?.widget.type !== 'LISTBOX' || players?.widget.type !== 'TEXT') return design;
  const spec = list.widget, heading = players.widget;
  const columns = spec.columns;
  if (columns.length !== 6 || columns[0]?.kind !== 1 || columns[1]?.kind !== 1 || columns.slice(2).some((c) => c.kind !== 0)) return design;
  const left = list.x + spec.leftMargin;
  // Browser table geometry within the native 447px pane. Text is clipped at draw time, so the complete native
  // caption remains the join input and every row keeps its original height, scale and selection treatment.
  const pingPosition = 170, playerPosition = 230;
  const playerX = left + playerPosition;
  const pingHeader: DialogRecord = {
    ...players, name: 'BriefingRoomPing', childOf: players.name, x: left + pingPosition - playerX, y: 0,
    widget: { ...heading, text: { ...heading.text, caption: 'PING' } },
  };
  const adaptedList: DialogRecord = {
    ...list,
    widget: {
      ...spec,
      columns: [
        { ...columns[0]!, maxWidth: pingPosition - 10 },
        { ...columns[1]!, position: pingPosition },
        { ...columns[1]!, position: playerPosition },
        ...columns.slice(2),
      ],
    },
  };
  return {
    ...design,
    controls: design.controls.map((c) => c !== list ? c : adaptedList),
    objects: [...design.objects.map((r) => r.name === 'BriefingRoomName' ? { ...r, x: left } : r !== players ? r : {
      ...players, x: playerX,
      widget: { ...heading, text: { ...heading.text, caption: 'PLAYERS' } },
    }), pingHeader],
  };
}

/** The browser table wrapper, scoped to the original's top-level briefing rooms; other dialogs pass through. */
export function withBriefingRoomPing(lookup: (name: string) => DialogDesign | null): (name: string) => DialogDesign | null {
  const cache = new WeakMap<DialogDesign, DialogDesign>();
  return (name) => {
    const design = lookup(name);
    if (!design || name.toLowerCase() !== WORLD_OF_SOCOM.toLowerCase()) return design;
    let adapted = cache.get(design);
    if (!adapted) { adapted = briefingRoomPingDesign(design); cache.set(design, adapted); }
    return adapted;
  };
}

/**
 * Browser table clip only. Native TEXT ignores MAXWIDTH; WRAPPED_TEXT lets unbroken words overflow and changes
 * row heights. The viewer's existing scissor clips partial glyphs without changing their quads, UVs or join text.
 * Match glyph runs to the native widget's placed text cells, including cells that emit no glyphs, rather than
 * guessing the column from a glyph's position (a room name may begin with spaces).
 */
export function briefingRoomPingDraw(parts: DialogPartsHost): DialogPartsHost['draw'] {
  return (screen, items) => {
    const drawn = parts.draw(screen, items), part = parts.of(screen);
    const design = part?.dialog.design;
    if (!part || !design?.objects.some((o) => o.name === 'BriefingRoomPing')) return drawn;
    const record = design.controls.find((c) => c.name === 'ROOMLIST');
    const list = part.widgets.get('ROOMLIST');
    if (record?.widget.type !== 'LISTBOX' || !(list instanceof ListboxWidget) || !list.face) return drawn;
    const spec = record.widget;
    const cells = list.placed.cells.filter((cell) => cell.kind === 'text' && layoutText(list.face!, list.items[cell.item]!.codes[cell.column] ?? [], 0, 0, { scale: 1, color: [128, 128, 128], alpha: 128 }).quads.length > 0);
    const left = record.x + spec.leftMargin + spec.columns[0]!.position;
    const nameClip: UiClip = { x0: record.x, x1: left + spec.columns[0]!.maxWidth - 1, y0: record.y, y1: record.y + spec.image.size[1] - 1 };
    let cell = 0;
    return drawn.map((item): UiDrawItem => {
      if (item.kind !== 'glyphs' || item.node !== record.name) return item;
      if (cells[cell++]?.column !== 0) return item;
      const held = item.clip;
      const clip: UiClip = held ? {
        x0: Math.max(held.x0, nameClip.x0), x1: Math.min(held.x1, nameClip.x1),
        y0: Math.max(held.y0, nameClip.y0), y1: Math.min(held.y1, nameClip.y1),
      } : nameClip;
      return { ...item, clip };
    });
  };
}
