import { createFromSource } from 'fumadocs-core/search/server';
import { source } from '../../../lib/source';

// The static search index (MW-9): Fumadocs' built-in search over every page, written once at build into
// out/api/search and loaded by the search dialog in the browser (components/search.tsx). Nothing is served on request.
export const revalidate = false;

export const { staticGET: GET } = createFromSource(source);
