import bundled from "./catalogue.json" with { type: "json" };
import {
  aerodromeChartMatches,
  aerodromeChartPart,
  baseName,
  fileOf,
  icaoOf,
  isIcao,
  nameMatches,
  nameMatchesLoosely,
  splitAerodromeTitle,
  titleMatches,
} from "./names.ts";
import type { Catalogue, CatalogueFolder, Chart, Publication, RawNode } from "./types.ts";

export const DEFAULT_BASE_URL = "https://aim.naviair.dk";

/** Root folder id → publication key. */
export const PUBLICATION_ROOTS: Readonly<Record<number, Publication>> = {
  295: "aip-dk",
  1: "vfg-dk",
  3704: "aip-fo",
  812: "aip-gl",
  265: "aic-a",
  1127: "aic-b",
  4240: "dqr",
};

export const PUBLICATIONS: readonly Publication[] = ["aip-dk", "aip-fo", "aip-gl", "vfg-dk", "aic-a", "aic-b", "dqr"];

export interface ClientOptions {
  /** Defaults to `https://aim.naviair.dk`. */
  baseUrl?: string;
  /** Custom fetch implementation (tests, proxies). Defaults to global `fetch`. */
  fetch?: typeof fetch;
  /** How long resolved lookups are cached, in ms. Defaults to 15 minutes. `0` disables caching. */
  cacheTtl?: number;
  /** Clock used to decide which version is in effect. Defaults to `() => new Date()`. */
  now?: () => Date;
  /** Folder structure used to work out a chart's publication/path. Defaults to the bundled snapshot. */
  catalogue?: Catalogue;
}

export interface LookupOptions {
  /**
   * Only consider charts from this publication. Useful because many charts exist in both the AIP (`aip-dk`)
   * and the VFR Flight Guide (`vfg-dk`). Without it, AIP copies are preferred over VFG copies.
   */
  publication?: Publication;
}

export interface AerodromeChartQuery extends LookupOptions {
  /** ICAO location indicator, e.g. `EKCH`. */
  icao: string;
  /**
   * Chart identifier, compared ignoring case, spaces and underscores: `ADC`, `GMC 1`, `RNP RWY 22L 2`,
   * `ILS_or_LOC_RWY_12_1`. Use `text` (or omit) for the AD 2 text section.
   */
  chart?: string;
}

export type ChartQuery = string | AerodromeChartQuery;

export class ChartNotFoundError extends Error {
  readonly query: ChartQuery;
  constructor(query: ChartQuery, detail?: string) {
    const q = typeof query === "string" ? query : `${query.icao} ${query.chart ?? "text"}`;
    super(`NAVIAIR chart not found: ${q}${detail ? ` (${detail})` : ""}`);
    this.name = "ChartNotFoundError";
    this.query = query;
  }
}

export class NaviairApiError extends Error {
  readonly status: number;
  readonly url: string;
  constructor(url: string, status: number) {
    super(`NAVIAIR API request failed with HTTP ${status}: ${url}`);
    this.name = "NaviairApiError";
    this.status = status;
    this.url = url;
  }
}

interface SearchResponse {
  nodes: RawNode[];
  total: number;
}

const PAGE_SIZE = 50;

export class NaviairClient {
  readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly cacheTtl: number;
  private readonly now: () => Date;
  private readonly folders = new Map<number, CatalogueFolder>();
  private readonly cache = new Map<string, { expires: number; value: Promise<unknown> }>();
  private liveFolders: Promise<void> | undefined;

  constructor(options: ClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = options.fetch ?? ((...args) => fetch(...args));
    this.cacheTtl = options.cacheTtl ?? 15 * 60 * 1000;
    this.now = options.now ?? (() => new Date());
    const catalogue = options.catalogue ?? (bundled as Catalogue);
    for (const [id, folder] of Object.entries(catalogue.folders)) this.folders.set(Number(id), folder);
  }

  /**
   * Resolve a chart to its current PDF URL.
   *
   * ```ts
   * await client.getChartUrl("EK_AD_2_EKCH_ADC_en.pdf");
   * await client.getChartUrl("EK_AD_2_EKCH_ADC");            // `.pdf` / `_en` optional
   * await client.getChartUrl({ icao: "EKCH", chart: "ADC" });
   * ```
   */
  async getChartUrl(query: ChartQuery, options?: LookupOptions): Promise<string> {
    return (await this.getChart(query, options)).url;
  }

  /** Resolve a chart to its current version. Throws {@link ChartNotFoundError} if nothing matches. */
  getChart(query: ChartQuery, options: LookupOptions = {}): Promise<Chart> {
    const key = JSON.stringify(["chart", query, options.publication ?? null]);
    return this.cached(key, async () => {
      const q: AerodromeChartQuery | string = typeof query === "string" ? query : { ...options, ...query };
      const publication = typeof q === "string" ? options.publication : q.publication;
      let candidates: Chart[];
      if (typeof q === "string") {
        candidates = await this.toCharts(await this.findByText(q));
      } else {
        if (!isIcao(q.icao)) throw new TypeError(`Not an ICAO location indicator: ${q.icao}`);
        const nodes = await this.searchAll(q.icao);
        candidates = await this.toCharts(
          nodes.filter((n) => !n.isDir && aerodromeChartMatches(n.name, n.title, q.icao, q.chart ?? "")),
        );
      }
      const best = this.pick(candidates, publication);
      if (!best) {
        throw new ChartNotFoundError(query, candidates.length && publication ? `not in ${publication}` : undefined);
      }
      return best;
    });
  }

  /**
   * Match a free-form string, trying in order: file name (or a stale NAVIAIR URL), display title, `ICAO chart`,
   * then a wider search for files whose href name differs from the node name.
   */
  private async findByText(query: string): Promise<RawNode[]> {
    // Accept an old, stale NAVIAIR link as well as a bare file name.
    const wanted = query.includes("/") ? fileOf(query) : query.trim();
    if (!baseName(wanted)) throw new TypeError(`Empty chart query: "${query}"`);
    const byName = (n: RawNode, eq: (name: string, query: string) => boolean) =>
      !n.isDir && (eq(n.name, wanted) || eq(fileOf(n.href), wanted));

    // 1. Exact file name, or display title ("EKCH RNP RWY 22R – 2") — search covers both.
    const found = await this.searchAll(baseName(wanted), 500);
    let nodes = found.filter((n) => byName(n, nameMatches));
    if (!nodes.length) nodes = found.filter((n) => !n.isDir && titleMatches(n.title, wanted));
    if (nodes.length) return nodes;

    // 2. "ICAO chart" with loose spelling ("EKCH RNP RWY 22R 2", "ekch adc").
    const ad = splitAerodromeTitle(wanted);
    if (ad) {
      nodes = (await this.searchAll(ad.icao)).filter(
        (n) => !n.isDir && aerodromeChartMatches(n.name, n.title, ad.icao, ad.chart),
      );
      if (nodes.length) return nodes;
    }

    // 3. The file name in the href sometimes differs from the node name (`RNP_RWY_22_L_2` vs `RNP_RWY_22L_2`,
    //    `BG_GEN_0_4_en_A_08-26` vs `BG_GEN_0_4_en`), and search doesn't look at hrefs. Widen the search — to
    //    the whole aerodrome, then by dropping trailing name segments — and compare loosely.
    const tokens = baseName(wanted).split("_");
    if (tokens.length < 2) return [];
    const icao = icaoOf(wanted);
    const wider = [icao, ...[1, 2, 3, 4].map((drop) => tokens.slice(0, -drop).join("_"))];
    for (const criterion of new Set(wider)) {
      if (!criterion || (criterion !== icao && criterion.split("_").length < 2)) continue;
      nodes = (await this.searchAll(criterion, 500)).filter((n) => byName(n, nameMatchesLoosely));
      if (nodes.length) return nodes;
    }
    return [];
  }

  /** All current charts for an aerodrome or heliport (AD 2 / AD 3), in NAVIAIR's display order. */
  getAerodromeCharts(icao: string, options: LookupOptions = {}): Promise<Chart[]> {
    if (!isIcao(icao)) return Promise.reject(new TypeError(`Not an ICAO location indicator: ${icao}`));
    const key = JSON.stringify(["aerodrome", icao.toUpperCase(), options.publication ?? null]);
    return this.cached(key, async () => {
      const nodes = await this.searchAll(icao);
      const charts = await this.toCharts(nodes.filter((n) => !n.isDir && aerodromeChartPart(n.name, icao) !== undefined));
      const publications = new Set(charts.map((c) => c.publication));
      // Without an explicit publication, show a single publication's set (the AIP one when there is a choice).
      const publication =
        options.publication ?? PUBLICATIONS.find((p) => publications.has(p)) ?? charts[0]?.publication;
      return charts
        .filter((c) => c.publication === publication && this.isEffective(c))
        .sort((a, b) => a.title.localeCompare(b.title, "en", { numeric: true }));
    });
  }

  /** Free-text search, same as the search box on aim.naviair.dk. Only files are returned. */
  async search(text: string, options: LookupOptions & { limit?: number } = {}): Promise<Chart[]> {
    const nodes = await this.searchAll(text, options.limit ?? 200);
    const charts = await this.toCharts(nodes.filter((n) => !n.isDir));
    return charts.filter((c) => !options.publication || c.publication === options.publication);
  }

  /** Children of a folder in the NAVIAIR tree. `0`/omitted lists the publications. */
  async getChildren(parentId?: number): Promise<RawNode[]> {
    return this.api<RawNode[]>("getnodesforparent", { parentId: parentId ? String(parentId) : "" });
  }

  /**
   * Walk the entire NAVIAIR tree (≈200 requests). Returns every folder and file.
   * Prefer {@link getChart}/{@link search}, which need 1–3 requests.
   */
  async crawl(options: { concurrency?: number } = {}): Promise<Catalogue> {
    const concurrency = options.concurrency ?? 6;
    const folders: Catalogue["folders"] = {};
    const charts: Catalogue["charts"] = [];
    const queue: number[] = [0];
    let active = 0;
    await new Promise<void>((resolve, reject) => {
      const next = (): void => {
        if (!queue.length && !active) return resolve();
        while (queue.length && active < concurrency) {
          const parentId = queue.shift()!;
          active++;
          this.getChildren(parentId).then((nodes) => {
            for (const n of nodes) {
              if (n.isDir) {
                folders[n.id] = { name: n.name, parentId: n.parentId };
                if (n.hasChildren) queue.push(n.id);
              } else {
                charts.push({ id: n.id, name: n.name, title: n.title, parentId: n.parentId });
              }
            }
            active--;
            next();
          }, reject);
        }
      };
      next();
    });
    for (const [id, f] of Object.entries(folders)) this.folders.set(Number(id), f);
    charts.sort((a, b) => a.id - b.id);
    return { generatedAt: this.now().toISOString(), folders, charts };
  }

  /** Clear cached lookups. */
  clearCache(): void {
    this.cache.clear();
  }

  // --- internals -------------------------------------------------------------------------------

  private async api<T>(method: string, params: Record<string, string>): Promise<T> {
    const url = `${this.baseUrl}/umbraco/api/naviairapi/${method}?${new URLSearchParams(params)}`;
    const res = await this.fetchImpl(url, { headers: { accept: "application/json" } });
    if (!res.ok) throw new NaviairApiError(url, res.status);
    return (await res.json()) as T;
  }

  private async searchAll(criterion: string, limit = Infinity): Promise<RawNode[]> {
    const nodes: RawNode[] = [];
    for (;;) {
      const take = Math.min(PAGE_SIZE, limit - nodes.length);
      const page = await this.api<SearchResponse>("getsearch", {
        criterion,
        skip: String(nodes.length),
        take: String(take),
      });
      nodes.push(...page.nodes);
      if (!page.nodes.length || nodes.length >= page.total || nodes.length >= limit) return nodes;
    }
  }

  private async toCharts(nodes: RawNode[]): Promise<Chart[]> {
    if (nodes.some((n) => this.pathOf(n.parentId) === undefined)) await this.loadLiveFolders();
    return nodes.map((n) => {
      const trail = this.pathOf(n.parentId) ?? [];
      return {
        id: n.id,
        name: n.name,
        title: n.title,
        url: new URL(n.link || n.href!, this.baseUrl + "/").href,
        parentId: n.parentId,
        path: trail.map((f) => f.name),
        publication: trail.length ? PUBLICATION_ROOTS[trail[0]!.id] : undefined,
        publishAt: n.publishAt ? new Date(n.publishAt) : null,
        unpublishAt: n.unpublishAt ? new Date(n.unpublishAt) : null,
      };
    });
  }

  /** Folder trail from root to `folderId`, or undefined if the folder is unknown. */
  private pathOf(folderId: number): { id: number; name: string }[] | undefined {
    const trail: { id: number; name: string }[] = [];
    for (let id = folderId; id !== 0; ) {
      const f = this.folders.get(id);
      if (!f || trail.length > 32) return undefined;
      trail.unshift({ id, name: f.name });
      id = f.parentId;
    }
    return trail;
  }

  /** NAVIAIR added a folder since the bundled snapshot — refresh the folder structure once. */
  private loadLiveFolders(): Promise<void> {
    this.liveFolders ??= this.crawl().then(
      () => undefined,
      (err) => {
        this.liveFolders = undefined;
        throw err;
      },
    );
    return this.liveFolders;
  }

  private isEffective(c: Chart, now = this.now()): boolean {
    return (!c.publishAt || c.publishAt <= now) && (!c.unpublishAt || c.unpublishAt > now);
  }

  /** Choose the version in effect now, preferring AIP over VFG copies, then the newest. */
  private pick(charts: Chart[], publication?: Publication): Chart | undefined {
    const pool = publication ? charts.filter((c) => c.publication === publication) : charts;
    const effective = pool.filter((c) => this.isEffective(c));
    const rank = (c: Chart) => {
      const i = c.publication ? PUBLICATIONS.indexOf(c.publication) : -1;
      return i < 0 ? PUBLICATIONS.length : i;
    };
    return (effective.length ? effective : pool).sort(
      (a, b) => rank(a) - rank(b) || (b.publishAt?.getTime() ?? 0) - (a.publishAt?.getTime() ?? 0),
    )[0];
  }

  private cached<T>(key: string, load: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = this.cache.get(key);
    if (hit && hit.expires > now) return hit.value as Promise<T>;
    const value = load();
    if (this.cacheTtl > 0) {
      this.cache.set(key, { expires: now + this.cacheTtl, value });
      value.catch(() => this.cache.delete(key));
    }
    return value;
  }
}
