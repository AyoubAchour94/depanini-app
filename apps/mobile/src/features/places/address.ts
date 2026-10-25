const COUNTRIES = new Set(['tunisie', 'tunisia', 'تونس']);

/**
 * An address as the customer reads it on screen: the street and the area,
 * without the postal code or the country ("Avenue Habib Bourguiba 42, 1001
 * Tunis, Tunisie" becomes "Avenue Habib Bourguiba 42, Tunis"). The stored
 * address stays whole; this is for display only.
 */
export function shortAddress(address: string): string {
  const parts = address
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return '';
  while (parts.length > 1 && COUNTRIES.has(parts[parts.length - 1]!.toLowerCase())) parts.pop();
  const cleaned = parts
    .map((part) => part.replace(/^\d{4}\s+/, ''))
    .filter((part) => part && !/^\d{4}$/.test(part));
  const distinct = cleaned.filter(
    (part, i) => i === 0 || part.toLowerCase() !== cleaned[i - 1]!.toLowerCase(),
  );
  return distinct.slice(0, 2).join(', ') || address.trim();
}
