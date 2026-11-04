import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { frontEndUrl, testRoomUrl } from '../pageUrls';

const TOOLS = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('frontEndUrl (OT.R19: the front end stays at the base; LOCAL-STACK, issue #100)', () => {
  it('the base path with the query as given, one slash, no test room', () => {
    expect(frontEndUrl('http://127.0.0.1:5342', 'devmode&server=ws://127.0.0.1:5340/ws')).toBe('http://127.0.0.1:5342/?devmode&server=ws://127.0.0.1:5340/ws');
    expect(frontEndUrl('http://127.0.0.1:5342/', 'devmode')).toBe('http://127.0.0.1:5342/?devmode');
    expect(frontEndUrl('https://socomunzipped.com/socomlegacy/')).toBe('https://socomunzipped.com/socomlegacy/');
    expect(frontEndUrl('http://localhost:5173/?old', 'devmode')).toBe('http://localhost:5173/?devmode');
  });
});

describe('testRoomUrl (OT.R19)', () => {
  it('joins the base and testroom without doubling slashes', () => {
    expect(testRoomUrl('http://localhost:5173')).toBe('http://localhost:5173/testroom');
    expect(testRoomUrl('http://localhost:5173/')).toBe('http://localhost:5173/testroom');
    expect(testRoomUrl('https://socomunzipped.com/socomlegacy/')).toBe('https://socomunzipped.com/socomlegacy/testroom');
    expect(testRoomUrl('https://socomunzipped.com/socomlegacy')).toBe('https://socomunzipped.com/socomlegacy/testroom');
  });
  it('keeps a query, and leaves an address already at the test room alone', () => {
    expect(testRoomUrl('http://localhost:5173/?devmode')).toBe('http://localhost:5173/testroom?devmode');
    expect(testRoomUrl('http://localhost:5173/testroom?devmode')).toBe('http://localhost:5173/testroom?devmode');
    expect(testRoomUrl('http://localhost:5173/testroom/')).toBe('http://localhost:5173/testroom');
  });
});

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    if (n === 'test' || n === 'node_modules') return [];
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|mjs|js|sh)$/.test(n) ? [p] : [];
  });
}

/** A line that builds a page address at a base path with a viewer / match parameter: `BASE?map=`, `/?mode=`, `5173/?devmode`. */
const VIEWER_PARAM = /(?:mode|map|kit|server)=|[?&](?:fly|mp|noarmory)\b/;
const BASE_ADDRESS = /(?:\$\{[^}]+\}|:\d+|\bBASE|\burl|URL_BASE)\/?\?|VIEWER_URL|localhost:\d+\/\?|\}\/\?\$\{/;

describe('every tool opens the viewer and the match at /testroom (OT.R19)', () => {
  it('no tool file builds a viewer or match address at the base path', () => {
    const hits: string[] = [];
    for (const f of files(TOOLS)) {
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
        const code = line.replace(/\s\/\/\s.*$/, '');
        const params = VIEWER_PARAM.test(code) || /localhost:\d+\/\?|\}\/\?\$\{|VIEWER_URL/.test(code);
        if (params && BASE_ADDRESS.test(code) && !/testRoom|pageUrls|frontEndUrl/.test(code)) hits.push(`${relative(TOOLS, f)}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(hits).toEqual([]);
  });
});
