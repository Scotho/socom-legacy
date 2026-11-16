/**
 * A community-server plugin example (product-track adaptation). One existing rules action, `message.show`,
 * on `round.start`. No imports: the host passes data JSON in, and the module does not read files.
 */
export default function plugin(input) {
  if (!input || input.event !== 'round.start') return [];
  return [{ do: 'message.show', text: 'plugin online' }];
}
