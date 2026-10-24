// Prices are stored as integer millimes (1 TND = 1000 millimes), as Konnect expects.
export function formatTND(millimes: number): string {
  return `${(millimes / 1000).toFixed(3)} TND`;
}

/** Parse an admin-typed TND amount ("12", "12.5", "12,500") into millimes. Returns null if invalid. */
export function parseTNDToMillimes(input: string): number | null {
  const s = input.trim().replace(",", ".");
  if (!/^\d{1,6}(\.\d{1,3})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const value = Number(whole) * 1000 + Number(frac.padEnd(3, "0"));
  return value > 0 ? value : null;
}
