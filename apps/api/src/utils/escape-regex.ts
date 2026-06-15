/**
 * Escapes special regex characters in a string to prevent NoSQL injection via $regex queries.
 * Always use this function before passing user input to a MongoDB $regex field.
 */
export function escapeRegExp(input: string | undefined | null): string {
  if (!input) return '';
  return input.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&');
}
