import { loader } from 'fumadocs-core/source';
import { docs } from '../.source/server';

// Every page lives under the site's root: content/docs/anatomy.mdx -> /anatomy/ (the plan's sitemap).
export const source = loader({
  baseUrl: '/',
  source: docs.toFumadocsSource(),
});
