/** Raw node as returned by `/umbraco/api/naviairapi/*` on aim.naviair.dk. */
export interface RawNode {
  id: number;
  parentId: number;
  name: string;
  title: string;
  tags: string | null;
  isDir: boolean;
  unpublishAt: string | null;
  publishAt: string | null;
  publishNodeAt: string | null;
  publishDocumentAt: string | null;
  /** Site-relative PDF path, e.g. `/media/files/kfgqtlumuoo/EK_AD_2_EKCH_ADC_en.pdf`. Changes on every re-issue. */
  href: string | null;
  hasChildren: boolean;
  link: string | null;
  published: boolean;
}

/** Top-level publications on aim.naviair.dk. */
export type Publication =
  | "aip-dk"
  | "vfg-dk"
  | "aip-fo"
  | "aip-gl"
  | "aic-a"
  | "aic-b"
  | "dqr";

export interface Chart {
  /** NAVIAIR node id. */
  id: number;
  /** PDF file name — the stable identifier, e.g. `EK_AD_2_EKCH_ADC_en.pdf`. */
  name: string;
  /** Display title on aim.naviair.dk, e.g. `02. EKCH ADC`. */
  title: string;
  /** Absolute URL of the current PDF. */
  url: string;
  /** Folder id the chart lives in. */
  parentId: number;
  /** Folder names from the publication root down to the chart's folder. Empty if unknown. */
  path: string[];
  /** Publication the chart belongs to, if known. */
  publication: Publication | undefined;
  /** When this version became effective. */
  publishAt: Date | null;
  /** When this version stops being published (mostly SUPs and withdrawn charts). */
  unpublishAt: Date | null;
}

export interface CatalogueFolder {
  name: string;
  parentId: number;
}

export interface CatalogueChart {
  id: number;
  name: string;
  title: string;
  parentId: number;
}

/** Snapshot of the NAVIAIR tree, bundled with the package (see `npm run crawl`). */
export interface Catalogue {
  generatedAt: string;
  folders: Record<string, CatalogueFolder>;
  charts: CatalogueChart[];
}
