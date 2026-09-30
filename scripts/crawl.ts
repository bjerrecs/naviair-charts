// Refresh the bundled snapshot of the NAVIAIR tree: node scripts/crawl.ts
import { writeFile } from "node:fs/promises";
import { NaviairClient } from "../src/client.ts";

const out = new URL("../src/catalogue.json", import.meta.url);
const started = Date.now();
const catalogue = await new NaviairClient().crawl();
await writeFile(out, JSON.stringify(catalogue, null, 1) + "\n");
console.log(
  `${Object.keys(catalogue.folders).length} folders, ${catalogue.charts.length} charts ` +
    `→ ${out.pathname} (${((Date.now() - started) / 1000).toFixed(1)}s)`,
);
