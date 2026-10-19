/**
 * Staff-name matching: "Meng" matches "MENG (PT)" and "meng(FT)" — case and
 * anything in brackets are ignored — but not "Mengyu" or "Meng Li". A target
 * that itself has a bracket ("Meng (PT)") must match the bracket too, which
 * tells two people with the same first name apart. Near misses are reported
 * to the user as suggestions, never used as matches.
 */

const BRACKETED = /\([^)]*\)?|\[[^\]]*\]?|\{[^}]*\}?/g;

export function normalizeName(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(BRACKETED, " ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}' -]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const compact = (raw: string) => raw.normalize("NFKC").toLowerCase().replace(/\s+/g, "");

export function nameMatches(rowName: string, target: string): boolean {
  if (/[([{]/.test(target)) return compact(target).length > 0 && compact(rowName) === compact(target);
  const wanted = normalizeName(target);
  return wanted.length > 0 && normalizeName(rowName) === wanted;
}

function editDistance(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j];
      previous[j] = Math.min(previous[j] + 1, previous[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return previous[b.length];
}

/** Names that look like the target without matching it ("Meng Li", "Mengyu", "Mang"). */
export function similarNames(names: string[], target: string): string[] {
  const wanted = normalizeName(target);
  if (!wanted) return [];
  return names.filter((name) => {
    if (nameMatches(name, target)) return false;
    const normalized = normalizeName(name);
    if (!normalized) return false;
    if (normalized === wanted) return true;
    const words = normalized.split(" ");
    if (words.some((word) => word.startsWith(wanted) || (word.length >= 3 && wanted.startsWith(word)))) return true;
    return wanted.length >= 4 && editDistance(normalized, wanted) <= 1;
  });
}
