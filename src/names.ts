/** Lower-case and drop everything but letters and digits: `RNP RWY 04R-2` → `rnprwy04r2`. */
export function squash(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Strip the `.pdf` extension and a trailing language suffix: `EK_AD_2_EKCH_ADC_en.pdf` → `EK_AD_2_EKCH_ADC`. */
export function baseName(name: string): string {
  return name
    .trim()
    .replace(/\.pdf$/i, "")
    .replace(/_en_?$/i, "");
}

/** True if `name` (a PDF file name) is what the user meant by `query`. Case, `.pdf` and `_en` are optional. */
export function nameMatches(name: string, query: string): boolean {
  return baseName(name).toLowerCase() === baseName(query).toLowerCase();
}

/** Like {@link nameMatches}, but also ignores underscores/punctuation: `RNP_RWY_22_L_2` ≈ `RNP_RWY_22L_2`. */
export function nameMatchesLoosely(name: string, query: string): boolean {
  return squash(baseName(name)) === squash(baseName(query));
}

/** File name part of a URL/path: `/media/files/abc/EK_AD_2_EKCH_en.pdf` → `EK_AD_2_EKCH_en.pdf`. */
export function fileOf(href: string | null | undefined): string {
  if (!href) return "";
  const last = href.split(/[?#]/)[0]!.split("/").pop() ?? "";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
}

const ICAO = /^[A-Z]{4}$/;

export function isIcao(s: string): boolean {
  return ICAO.test(s.toUpperCase());
}

/** Search criterion that finds every chart of the aerodrome/heliport a file name belongs to, if any. */
export function icaoOf(name: string): string | undefined {
  return /^[A-Z]{2}_(?:AD_[23]_)?([A-Z]{4})(?:_|$)/i.exec(baseName(name))?.[1]?.toUpperCase();
}

/**
 * The chart part of an aerodrome chart file name, or undefined if `name` is not an AD 2/AD 3 chart for `icao`.
 * `EK_AD_2_EKCH_ILS_or_LOC_RWY_12_1_en.pdf` → `ILS_or_LOC_RWY_12_1`; the aerodrome text (`EK_AD_2_EKCH_en.pdf`) → `""`.
 */
export function aerodromeChartPart(name: string, icao: string): string | undefined {
  const m = /^[A-Z]{2}_(?:AD_[23]_)?([A-Z]{4})(?:_(.*))?$/i.exec(baseName(name));
  if (!m || m[1]!.toUpperCase() !== icao.toUpperCase()) return undefined;
  return m[2] ?? "";
}

/** Aliases for the aerodrome text section (`EK_AD_2_EKCH_en.pdf`). */
const TEXT_ALIASES = new Set(["", "text", "ad", "ad2", "data"]);

/** True if the aerodrome chart `name` is what the user meant by `chart` (e.g. `ADC`, `rnp rwy 22L 2`, `text`). */
export function aerodromeChartMatches(name: string, title: string, icao: string, chart: string): boolean {
  const part = aerodromeChartPart(name, icao);
  if (part === undefined) return false;
  const want = squash(chart);
  if (part === "") return TEXT_ALIASES.has(want);
  if (squash(part) === want) return true;
  // Titles look like "02. EKCH ADC" — allow matching those too.
  const t = squash(title.replace(/^\d+\.\s*/, ""));
  return t === want || t === squash(icao) + want;
}

/** Strip NAVIAIR's ordering prefix from a title: `82. EKCH RNP RWY 22R – 2` → `EKCH RNP RWY 22R – 2`. */
export function stripOrdinal(title: string): string {
  return title.trim().replace(/^\d+\.\s*/, "");
}

/**
 * True if a display title is what the user meant by `query`, ignoring case, punctuation, dashes and the ordering
 * prefix: `EKCH RNP RWY 22R - 2` and `82. ekch rnp rwy 22r – 2` both match `82. EKCH RNP RWY 22R – 2`.
 */
export function titleMatches(title: string, query: string): boolean {
  const want = squash(stripOrdinal(query));
  return want !== "" && squash(stripOrdinal(title)) === want;
}

/** Split `EKCH RNP RWY 22R – 2` into `{ icao: "EKCH", chart: "RNP RWY 22R – 2" }`. */
export function splitAerodromeTitle(query: string): { icao: string; chart: string } | undefined {
  const m = /^([A-Z]{4})[\s:–-]+(.+)$/i.exec(stripOrdinal(query));
  return m ? { icao: m[1]!.toUpperCase(), chart: m[2]! } : undefined;
}
