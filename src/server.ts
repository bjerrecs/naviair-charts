import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { ChartNotFoundError, NaviairClient, PUBLICATIONS, type ChartQuery, type LookupOptions } from "./client.ts";
import type { Publication } from "./types.ts";

export interface HandlerOptions {
  client?: NaviairClient;
  /** Path prefix the handler is mounted under, e.g. `/naviair`. */
  basePath?: string;
}

/**
 * A `node:http` request handler that turns stable URLs into redirects to the current PDF:
 *
 * - `GET /charts/EK_AD_2_EKCH_ADC_en.pdf` → 302 to the current PDF
 * - `GET /charts/EKCH/ADC` → 302 to the current PDF (ICAO + chart)
 * - `GET /charts/...?format=json` → chart metadata instead of a redirect
 * - `GET /aerodromes/EKCH` → JSON list of the aerodrome's charts
 * - `GET /search?q=EKCH%20ADC` → JSON search results
 *
 * All routes accept `?publication=vfg-dk` (etc.). Works with Express/Connect as middleware too.
 */
export function createHandler(options: HandlerOptions = {}) {
  const client = options.client ?? new NaviairClient();
  const basePath = (options.basePath ?? "").replace(/\/+$/, "");

  return async function handler(req: IncomingMessage, res: ServerResponse, next?: (err?: unknown) => void) {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith(basePath + "/") || (req.method !== "GET" && req.method !== "HEAD")) {
      return next ? next() : send(res, 404, { error: "Not found" });
    }
    let parts: string[];
    try {
      parts = url.pathname.slice(basePath.length + 1).split("/").filter(Boolean).map(decodeURIComponent);
    } catch {
      return send(res, 400, { error: "Malformed URL" });
    }
    const publication = url.searchParams.get("publication") ?? undefined;
    if (publication && !PUBLICATIONS.includes(publication as Publication)) {
      return send(res, 400, { error: `Unknown publication "${publication}". Use one of: ${PUBLICATIONS.join(", ")}` });
    }
    const lookup: LookupOptions = { publication: publication as Publication | undefined };

    try {
      if (parts[0] === "charts" && (parts.length === 2 || parts.length === 3)) {
        const query: ChartQuery = parts.length === 2 ? parts[1]! : { icao: parts[1]!, chart: parts[2]! };
        const chart = await client.getChart(query, lookup);
        if (url.searchParams.get("format") === "json") return send(res, 200, chart);
        res.writeHead(302, {
          location: chart.url,
          "cache-control": "public, max-age=300",
          "access-control-allow-origin": "*",
        });
        return res.end();
      }
      if (parts[0] === "aerodromes" && parts.length === 2) {
        return send(res, 200, await client.getAerodromeCharts(parts[1]!, lookup));
      }
      if (parts[0] === "search" && parts.length === 1) {
        const q = url.searchParams.get("q");
        if (!q) return send(res, 400, { error: "Missing ?q=" });
        return send(res, 200, await client.search(q, lookup));
      }
      if (parts[0] === "health" && parts.length === 1) return send(res, 200, { ok: true });
      return next ? next() : send(res, 404, { error: "Not found" });
    } catch (err) {
      if (err instanceof ChartNotFoundError) return send(res, 404, { error: err.message });
      if (err instanceof TypeError) return send(res, 400, { error: err.message });
      return send(res, 502, { error: err instanceof Error ? err.message : String(err) });
    }
  };
}

/** Start a standalone redirect server. */
export function startServer(options: HandlerOptions & { port?: number; host?: string } = {}): Promise<Server> {
  const handler = createHandler(options);
  const server = createServer((req, res) => {
    handler(req, res).catch((err) => {
      if (!res.headersSent) send(res, 500, { error: "Internal error" });
      else res.destroy(err);
    });
  });
  return new Promise((resolve) => server.listen(options.port ?? 8080, options.host, () => resolve(server)));
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(body, null, 2));
}
