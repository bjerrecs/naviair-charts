import bundled from "./catalogue.json" with { type: "json" };
import { NaviairClient, type ChartQuery, type LookupOptions } from "./client.ts";
import type { Catalogue, Chart } from "./types.ts";

export {
  NaviairClient,
  ChartNotFoundError,
  NaviairApiError,
  DEFAULT_BASE_URL,
  PUBLICATIONS,
  PUBLICATION_ROOTS,
} from "./client.ts";
export type { AerodromeChartQuery, ChartQuery, ClientOptions, LookupOptions } from "./client.ts";
export type { Catalogue, CatalogueChart, CatalogueFolder, Chart, Publication, RawNode } from "./types.ts";

let defaultClient: NaviairClient | undefined;

/** The shared client used by the top-level helpers. */
export function getDefaultClient(): NaviairClient {
  return (defaultClient ??= new NaviairClient());
}

/**
 * Current PDF URL for a chart.
 *
 * ```ts
 * await getChartUrl("EK_AD_2_EKCH_ADC_en.pdf");
 * await getChartUrl({ icao: "EKCH", chart: "RNP RWY 22L 1" });
 * await getChartUrl("EK_AD_2_EKRK_VAC", { publication: "vfg-dk" });
 * ```
 */
export function getChartUrl(query: ChartQuery, options?: LookupOptions): Promise<string> {
  return getDefaultClient().getChartUrl(query, options);
}

/** Current version of a chart, including its URL, title, folder path and effective dates. */
export function getChart(query: ChartQuery, options?: LookupOptions): Promise<Chart> {
  return getDefaultClient().getChart(query, options);
}

/** All current AD 2 charts for an aerodrome, e.g. `getAerodromeCharts("EKCH")`. */
export function getAerodromeCharts(icao: string, options?: LookupOptions): Promise<Chart[]> {
  return getDefaultClient().getAerodromeCharts(icao, options);
}

/** Free-text search across aim.naviair.dk. */
export function searchCharts(text: string, options?: LookupOptions & { limit?: number }): Promise<Chart[]> {
  return getDefaultClient().search(text, options);
}

/**
 * Snapshot of every chart name/folder on aim.naviair.dk at the time this package version was published.
 * Handy for autocomplete and discovery — resolve URLs with {@link getChartUrl}, never from the snapshot.
 */
export const catalogue: Catalogue = bundled as Catalogue;
