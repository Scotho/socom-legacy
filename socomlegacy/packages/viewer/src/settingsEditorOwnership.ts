/** Browser adaptation: the native Options host and the Home overlay both write the same card. Keep their editors
 * exclusive per game document, including loading and closing transitions. Unrelated tabs retain their own ownership.
 */
const editors = new WeakMap<Document, object>();

export function claimSettingsEditor(doc: Document, owner: object): (() => void) | null {
  if (editors.has(doc)) return null;
  editors.set(doc, owner);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (editors.get(doc) === owner) editors.delete(doc);
  };
}
