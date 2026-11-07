import { defineConfig, defineDocs } from 'fumadocs-mdx/config';
import { pageSchema } from 'fumadocs-core/source/schema';
import { z } from 'zod';
import { STATUSES } from './lib/status';

// The wiki's one collection: content/docs/ (MDX pages and meta.json sidebars). Every page carries MW.R6's status and
// what owns it (MW-3): `status`, one of the five; `source`, a repository path (a line or range after `:`, a section
// after `#`) or a list of them. A page without both fails the build; socomlegacy/tools/test/moddingWikiStatus.test.ts
// holds the rest (the paths exist and ship, no shipped claim on an unshipped page).
export const docs = defineDocs({
  dir: 'content/docs',
  docs: {
    schema: pageSchema.extend({
      status: z.enum(STATUSES),
      source: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
    }),
  },
});

export default defineConfig();
