import { describe, expect, it } from 'vitest';
import {
  CLOSE_REPORT_ADAPTATION, CLOSE_REPORT_BODY_MAX_BYTES, CLOSE_REPORT_MARKER, CLOSE_REPORT_PATH, CLOSE_REPORT_POST_DELAY_MS, closeReportBody, closeReportUrl, pageCloseReport,
  parseCloseReport, type CloseReportPage,
} from '../src/net/closeReport';

/**
 * LATER 62 (CLOSE_REPORT_ADAPTATION): the page's half of the close report -- a development and playtest instrument with
 * no original, a development build's with ?devmode only. Its route on the server or door the socket named, its one fixed
 * shape (what the server reads, `parseCloseReport`), and the reporter's gate. No server is contacted (R293).
 */

const PAGE: CloseReportPage = { id: 3, why: 'net-error', path: 'tick-ended', state: 'closed', code: 1006, phase: 'match', late: true, sinceMatchMs: 72_000 };

describe('LATER 62: the close report\'s page half', () => {
  it('is labelled an adaptation: a development build\'s with ?devmode, the server\'s with CLOSE_REPORT=1', () => {
    expect(CLOSE_REPORT_ADAPTATION).toMatch(/no original/);
    expect(CLOSE_REPORT_ADAPTATION).toMatch(/CLOSE_REPORT=1/);
    expect(CLOSE_REPORT_PATH).toBe('/dev/close-report');
  });

  it('the route on the server the socket names, a door\'s game path kept; none for a socket of another scheme', () => {
    expect(closeReportUrl('ws://127.0.0.1:8787/ws?x=1')).toBe(`http://127.0.0.1:8787${CLOSE_REPORT_PATH}`);
    expect(closeReportUrl('wss://firehuge.play.example.com/g/7')).toBe(`https://firehuge.play.example.com/g/7${CLOSE_REPORT_PATH}`);
    expect(closeReportUrl('http://127.0.0.1/ws')).toBeNull();
    expect(closeReportUrl('not a url')).toBeNull();
  });

  it('one fixed shape: the body reads back field for field, under the bound; anything else is refused', () => {
    const body = closeReportBody(PAGE);
    expect(Buffer.byteLength(body)).toBeLessThanOrEqual(CLOSE_REPORT_BODY_MAX_BYTES);
    expect(parseCloseReport(body)).toEqual({ kind: CLOSE_REPORT_MARKER, ...PAGE });
    expect(parseCloseReport(closeReportBody({ ...PAGE, code: null, sinceMatchMs: null }))).toMatchObject({ code: null, sinceMatchMs: null });
    for (const bad of [
      '', 'x', '[]', JSON.stringify({ ...PAGE }), JSON.stringify({ kind: CLOSE_REPORT_MARKER, ...PAGE, why: 'gone' }),
      JSON.stringify({ kind: CLOSE_REPORT_MARKER, ...PAGE, id: -1 }), JSON.stringify({ kind: CLOSE_REPORT_MARKER, ...PAGE, path: 'x'.repeat(65) }),
      JSON.stringify({ kind: CLOSE_REPORT_MARKER, ...PAGE, extra: 1 }),
    ]) expect(parseCloseReport(bad), bad.slice(0, 40)).toBeNull();
  });

  it('the reporter: none without ?devmode; with it, one post of the body to the socket\'s route after CLOSE_REPORT_POST_DELAY_MS (the review\'s F4)', () => {
    const posts: [string, string][] = [];
    const waits: { run: () => void; ms: number }[] = [];
    const doc = (search: string) => ({ defaultView: { location: { search } } }) as unknown as Document;
    expect(pageCloseReport({ doc: doc(''), post: (u, b) => { posts.push([u, b]); } })).toBeNull();
    const report = pageCloseReport({ doc: doc('?devmode'), post: (u, b) => { posts.push([u, b]); }, after: (run, ms) => { waits.push({ run, ms }); } })!;
    report('wss://firehuge.play.example.com/g/7', PAGE);
    report('not a url', PAGE);                                                   // no route: nothing posted, nothing waited
    expect(posts).toEqual([]);                                                   // the post waits
    expect(waits.map((w) => w.ms)).toEqual([CLOSE_REPORT_POST_DELAY_MS]);
    waits[0]!.run();
    expect(posts).toEqual([[`https://firehuge.play.example.com/g/7${CLOSE_REPORT_PATH}`, closeReportBody(PAGE)]]);
  });
});
