import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PACK_CODES, PACK_FILE_ROW_KEYS, PACK_HANDLER_CLAIM_KEYS, PACK_MANIFEST_KEYS, validatePack,
} from '../../packages/creator-contracts/src/packs';
import {
  DESCRIPTIONS_FILE, PAGES, REFERENCE_DIR, STATUSES, codeKeys, descriptionGaps, expandTokens, readDescriptions, referenceFiles,
} from '../moddingWikiReference';

/**
 * The modding wiki's reference pages never drift from the pack contract (B205 MW-2, MW.R5; product track, OT.R53: a
 * project site's text, nothing the game does). The pages are generated from `packages/creator-contracts/src/packs.ts`
 * and the hand-written `descriptions.json`; this test reads the code and the wiki's committed files only (never the
 * wiki's own node_modules), so it runs in the gate's tools suite with no Next.js installed.
 */

const read = (rel: string): string => readFileSync(join(REFERENCE_DIR, rel), 'utf8').replace(/\r\n/g, '\n');

describe('the modding wiki reference (MW-2)', () => {
  it('reads the validator\'s own key sets: every listed manifest field is known, one outside them is FIELD_UNKNOWN', async () => {
    expect(PACK_MANIFEST_KEYS.size).toBeGreaterThan(0);
    expect(PACK_FILE_ROW_KEYS.size).toBeGreaterThan(0);
    expect(PACK_HANDLER_CLAIM_KEYS.size).toBeGreaterThan(0);
    const raw: Record<string, unknown> = Object.fromEntries([...PACK_MANIFEST_KEYS].map((k) => [k, null]));
    raw['notAField'] = 1;
    const bytes = new TextEncoder().encode(JSON.stringify(raw));
    const result = await validatePack([{ path: 's2u-pack.json', bytes }], { target: 'x', contract: '0.0.0' });
    expect(result.ok).toBe(false);
    const unknown = result.report.diagnostics.filter((d) => d.code === PACK_CODES.fieldUnknown).map((d) => d.field);
    expect(unknown).toEqual(['notAField']);
  });

  it('describes every key the code has', () => {
    const gaps = descriptionGaps(codeKeys(), readDescriptions());
    expect(gaps.missing).toEqual([]);
  });

  it('holds no description of a key the code does not have', () => {
    const gaps = descriptionGaps(codeKeys(), readDescriptions());
    expect(gaps.extra).toEqual([]);
  });

  it('commits exactly what the generator writes now', () => {
    const files = referenceFiles(readDescriptions());
    for (const [rel, text] of Object.entries(files)) {
      expect(existsSync(join(REFERENCE_DIR, rel)), `${rel} is missing: run the generator`).toBe(true);
      expect(read(rel), `${rel} is stale: run \`npx tsx tools/moddingWikiReference.ts\` from socomlegacy/`).toBe(text);
    }
    const hand = new Set(['meta.json', 'descriptions.json']);
    const stray = readdirSync(REFERENCE_DIR).filter((name) => !hand.has(name) && !(name in files));
    expect(stray).toEqual([]);
  });

  it('writes the three pages the sidebar lists, each with one MW.R6 status', () => {
    const meta = JSON.parse(read('meta.json')) as { pages: string[] };
    expect(meta.pages).toEqual(PAGES.map((p) => p.slug));
    const files = referenceFiles(readDescriptions());
    for (const page of PAGES) {
      expect(STATUSES).toContain(page.status);
      const text = files[`${page.slug}.mdx`]!;
      const lines = text.split('\n').filter((l) => /^\*\*Status: /.test(l));
      expect(lines).toHaveLength(1);
      expect(lines[0]!.startsWith(`**Status: ${page.status}.**`)).toBe(true);
    }
  });

  it('writes a value the code holds through its token, never a guess: an unknown token is refused', () => {
    expect(expandTokens('at most %PACK_ID_CHARS_ADAPTATION% characters', 't')).toBe('at most 64 characters');
    expect(expandTokens('%THUNDERSTORE_PACKAGE_RULES.name.maxChars%', 't')).toBe('128');
    expect(() => expandTokens('%PACK_NO_SUCH_ADAPTATION%', 't')).toThrow(/names no exported/);
  });

  it('keeps the descriptions file at its path, one non-empty line of text a key', () => {
    expect(DESCRIPTIONS_FILE).toBe(join(REFERENCE_DIR, 'descriptions.json'));
    for (const [section, entries] of Object.entries(readDescriptions())) {
      for (const [key, text] of Object.entries(entries)) {
        expect(typeof text, `${section}.${key}`).toBe('string');
        expect(text.trim().length, `${section}.${key}`).toBeGreaterThan(0);
        expect(text, `${section}.${key}`).not.toMatch(/\n/);
      }
    }
  });
});
