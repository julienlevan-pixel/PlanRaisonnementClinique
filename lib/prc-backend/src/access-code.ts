/** Accept typographical separators without changing a code's letters or digits. */
export function normalizeAccessCode(value: string): string {
  const compact = value.replace(/[\s\u2010-\u2015-]+/g, "").toUpperCase();
  return compact.length === 9 && compact.startsWith("S")
    ? `S-${compact.slice(1)}`
    : compact;
}
