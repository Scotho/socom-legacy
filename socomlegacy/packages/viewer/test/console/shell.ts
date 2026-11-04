import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The console page's own markup (`index.html`, the base path's page since CX-9a), its body put into `doc` as the page has it. */
export const CONSOLE_HTML = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../index.html'), 'utf-8');

export function mountShell(doc: Document): void {
  const parsed = new DOMParser().parseFromString(CONSOLE_HTML, 'text/html');
  doc.body.innerHTML = parsed.body.innerHTML;
  doc.documentElement.removeAttribute('style');
  doc.documentElement.dataset.input = parsed.documentElement.dataset.input ?? '';
  // The page's own rules apply under this mark (`console/index.html`, `src/console/console.css`).
  if (parsed.documentElement.hasAttribute('data-console')) doc.documentElement.setAttribute('data-console', '');
}
