/**
 * HITBOX-TRACE's join (a development instrument with no original; product track: it reads two trace files and prints).
 * From socomlegacy/:
 *   npx tsx tools/hitboxTrace.ts <room.jsonl> <page.json>
 *
 * `room.jsonl`: the match server's trace (`S2U_HITBOX_TRACE=<path>`, `packages/match/src/hitboxTrace.ts`), one JSON line
 * each. `page.json`: the page's (`window.__viewer.hitboxTrace()` under `?devmode&hitboxtrace`,
 * `packages/viewer/src/hitboxTrace.ts`), a JSON array (or JSON lines). The two are joined body for body by (id, tick ==
 * the page's playout tick rounded), and it prints, by kind and state:
 *
 * - the per-bone centre gap (bones matched by index; worst and mean) and the top-edge gap (page `topY` - room `topY`);
 * - how often `posed` differs between the sides;
 * - for each order the room judged, refused and taken apart: where its line meets the hostage on each side's boxes (the
 *   hit's height above the feet and its bone) and the line's margin from the other side's boxes (0: it meets them too) --
 *   the table that says whether refusals sit only at the top edge or also at the body's middle; for a refused order,
 *   both bodies at its tick (their feet and top edges).
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { bodyOfTrace, HITBOX_TRACE_REACH, rayMargin, rayMeet, type RayMeet, type TraceBody } from '../packages/viewer/src/hitboxTrace';

type Line = Record<string, unknown>;
type BodyLine = TraceBody & { id: number; kind: string; state: unknown; posed: boolean };

export interface GapStats { n: number; worst: number; mean: number }
export interface GroupSummary { key: string; frames: number; centre: GapStats; top: GapStats & { signedMean: number }; posedDiffers: number }
export interface OrderRow {
  tick: number; at: number | null; viewTick: number | null; why: string | null; picked: number | null; hostage: number;
  room: RayMeet | null; page: RayMeet | null;
  /** The line's least distance from the room's boxes and from the page's (0: it meets them). Null: that side's body absent. */
  marginRoom: number | null; marginPage: number | null;
  roomBody: { feet: number[]; topY: number } | null; pageBody: { feet: number[]; topY: number } | null;
}
/** A page's offer or order line, with where its line meets the room's body at its tick (`marginRoom` 0: it meets it too). */
export interface PageEventRow { event: string; viewTick: number; hostage: number | null; why: string | null; page: RayMeet | null; room: RayMeet | null; marginRoom: number | null }
export interface JoinSummary { groups: GroupSummary[]; orders: OrderRow[]; pageEvents: PageEventRow[]; unmatchedPage: number }

const stats = (v: readonly number[]): GapStats => ({ n: v.length, worst: v.length ? Math.max(...v) : 0, mean: v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0 });

/** Parses a trace file: a JSON array, or one JSON object a line. */
export function readTrace(text: string): Line[] {
  const t = text.trim();
  if (!t) return [];
  if (t.startsWith('[')) return JSON.parse(t) as Line[];
  return t.split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l) as Line);
}

/** The join (pure): the room's lines and the page's. */
export function joinTraces(room: readonly Line[], page: readonly Line[]): JoinSummary {
  const roomBodies = new Map<string, BodyLine>();
  for (const l of room) if (l['event'] === undefined && Array.isArray(l['boxes'])) roomBodies.set(`${l['id']}:${l['tick']}`, l as unknown as BodyLine);
  const pageBodies = new Map<string, BodyLine>();
  const groups = new Map<string, { frames: number; centre: number[]; top: number[]; signed: number[]; posedDiffers: number }>();
  let unmatchedPage = 0;
  for (const l of page) {
    if (l['event'] !== undefined || !Array.isArray(l['boxes'])) continue;
    const tick = Math.round(l['viewTick'] as number);
    const p = l as unknown as BodyLine;
    pageBodies.set(`${p.id}:${tick}`, p);
    const r = roomBodies.get(`${p.id}:${tick}`);
    if (!r) { unmatchedPage++; continue; }
    const key = `${r.kind} ${String(r.state)}`;
    const g = groups.get(key) ?? { frames: 0, centre: [], top: [], signed: [], posedDiffers: 0 };
    groups.set(key, g);
    g.frames++;
    if (r.posed !== p.posed) g.posedDiffers++;
    const byBone = new Map(r.boxes.map((b) => [b.bone, b]));
    for (const b of p.boxes) {
      const o = byBone.get(b.bone);
      if (o) g.centre.push(Math.hypot(b.centre[0] - o.centre[0], b.centre[1] - o.centre[1], b.centre[2] - o.centre[2]));
    }
    g.top.push(Math.abs(p.topY - r.topY));
    g.signed.push(p.topY - r.topY);
  }
  const orders: OrderRow[] = [];
  for (const l of room) {
    if (l['event'] !== 'order' || !Array.isArray(l['eye'])) continue;
    const eye = l['eye'] as number[], dir = l['dir'] as number[], hostage = l['hostage'] as number;
    const at = (l['at'] as number | null) ?? null, viewTick = (l['viewTick'] as number | null) ?? null;
    const judged = ((l['bodies'] as (TraceBody & { id: number })[] | undefined) ?? []).find((b) => b.id === hostage) ?? null;
    const t = Math.round(at ?? viewTick ?? (l['tick'] as number));
    const pb = pageBodies.get(`${hostage}:${t}`) ?? null;
    const roomBody = judged ? bodyOfTrace(judged) : null, pageBody = pb ? bodyOfTrace(pb) : null;
    orders.push({
      tick: l['tick'] as number, at, viewTick, why: (l['why'] as string | null) ?? null, picked: (l['picked'] as number | null) ?? null, hostage,
      room: roomBody ? rayMeet(eye, dir, HITBOX_TRACE_REACH, roomBody) : null,
      page: pageBody ? rayMeet(eye, dir, HITBOX_TRACE_REACH, pageBody) : null,
      marginRoom: roomBody ? rayMargin(eye, dir, HITBOX_TRACE_REACH, roomBody) : null,
      marginPage: pageBody ? rayMargin(eye, dir, HITBOX_TRACE_REACH, pageBody) : null,
      roomBody: judged ? { feet: judged.feet, topY: judged.topY } : null, pageBody: pb ? { feet: pb.feet, topY: pb.topY } : null,
    });
  }
  const pageEvents: PageEventRow[] = [];
  for (const l of page) {
    if ((l['event'] !== 'order' && l['event'] !== 'offer') || !Array.isArray(l['eye'])) continue;
    const eye = l['eye'] as number[], dir = l['dir'] as number[], vt = l['viewTick'] as number;
    const hostage = (l['hostage'] as number | null) ?? null;
    const pb = (l['body'] as TraceBody | null) ?? null;
    const rb = hostage !== null ? roomBodies.get(`${hostage}:${Math.round(vt)}`) ?? null : null;
    const roomBody = rb ? bodyOfTrace(rb) : null;
    pageEvents.push({
      event: l['event'] as string, viewTick: vt, hostage, why: (l['why'] as string | null) ?? null,
      page: pb ? rayMeet(eye, dir, HITBOX_TRACE_REACH, bodyOfTrace(pb)) : null,
      room: roomBody ? rayMeet(eye, dir, HITBOX_TRACE_REACH, roomBody) : null,
      marginRoom: roomBody ? rayMargin(eye, dir, HITBOX_TRACE_REACH, roomBody) : null,
    });
  }
  return {
    pageEvents,
    groups: [...groups].map(([key, g]) => ({ key, frames: g.frames, centre: stats(g.centre), top: { ...stats(g.top), signedMean: stats(g.signed).mean }, posedDiffers: g.posedDiffers })),
    orders, unmatchedPage,
  };
}

const f = (v: number | null | undefined, d = 2): string => (v === null || v === undefined ? '-' : v.toFixed(d));
const meet = (m: RayMeet | null): string => (m ? `h ${f(m.height)} bone ${m.bone}` : 'miss');

/** The summary as text. */
export function formatSummary(s: JoinSummary): string {
  const out: string[] = ['HITBOX-TRACE join', `page body lines with no room line at their tick: ${s.unmatchedPage}`, '', 'kind state | frames | centre gap worst / mean | top gap worst / mean (signed page-room) | posed differs'];
  for (const g of s.groups) out.push(`${g.key} | ${g.frames} | ${f(g.centre.worst, 3)} / ${f(g.centre.mean, 3)} | ${f(g.top.worst, 3)} / ${f(g.top.mean, 3)} (${f(g.top.signedMean, 3)}) | ${g.posedDiffers}`);
  for (const taken of [false, true]) {
    const rows = s.orders.filter((o) => (o.why === null) === taken);
    out.push('', `${taken ? 'TAKEN' : 'REFUSED'} orders (${rows.length}): tick at | why | room meet | page meet | margin from room / page boxes`);
    for (const o of rows) {
      out.push(`${o.tick} ${f(o.at, 1)} | ${o.why ?? 'taken'} | ${meet(o.room)} | ${meet(o.page)} | ${f(o.marginRoom)} / ${f(o.marginPage)}`);
      if (!taken) out.push(`    room body feet ${o.roomBody?.feet.map((v) => v.toFixed(2)).join(',') ?? '-'} top ${f(o.roomBody?.topY)}; page body feet ${o.pageBody?.feet.map((v) => v.toFixed(2)).join(',') ?? '-'} top ${f(o.pageBody?.topY)}`);
    }
  }
  out.push('', `PAGE offers and orders (${s.pageEvents.length}): viewTick | event hostage-or-why | page meet | room meet at that tick | margin from room boxes`);
  for (const e of s.pageEvents) out.push(`${f(e.viewTick, 1)} | ${e.event} ${e.hostage ?? e.why ?? '-'} | ${meet(e.page)} | ${meet(e.room)} | ${f(e.marginRoom)}`);
  return out.join('\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [roomPath, pagePath] = process.argv.slice(2);
  if (!roomPath || !pagePath) {
    console.error('usage: npx tsx tools/hitboxTrace.ts <room.jsonl> <page.json>');
    process.exit(2);
  }
  console.log(formatSummary(joinTraces(readTrace(readFileSync(roomPath, 'utf8')), readTrace(readFileSync(pagePath, 'utf8')))));
}
