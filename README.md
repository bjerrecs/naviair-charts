# naviair-charts

Stable, AIRAC-proof links to the charts on [aim.naviair.dk](https://aim.naviair.dk/) (AIP Danmark, VFR Flight Guide,
AIP Færøerne, AIP Grønland, AIC A/B).

NAVIAIR serves every PDF from a random folder that changes every time the chart is re-issued:

```
https://aim.naviair.dk/media/files/kfgqtlumuoo/EK_AD_2_EKCH_ADC_en.pdf
                                   ^^^^^^^^^^^ changes with each AIRAC amendment
```

so any link you save or bookmark eventually stops working. This package looks up the chart by its stable name through
NAVIAIR's own API and returns the URL that is current right now.

```sh
npm install naviair-charts
```

Requires Node.js 20.10+ (uses the built-in `fetch`). ESM only: use `import`, or `await import("naviair-charts")` from
CommonJS (Node 20.19+ / 22.12+ can also `require()` it).

Browsers can't call aim.naviair.dk directly (it sends no CORS headers), so use this package on a server. The
[redirect server](#permanent-links-redirect-server) sends CORS headers, so a front end can call that instead.

## Usage

```ts
import { getChartUrl, getChart, getAerodromeCharts, searchCharts } from "naviair-charts";

// By file name — `.pdf`, `_en` and case are optional
await getChartUrl("EK_AD_2_EKCH_ADC_en.pdf");
// → https://aim.naviair.dk/media/files/kfgqtlumuoo/EK_AD_2_EKCH_ADC_en.pdf

// By the title shown on aim.naviair.dk (ordering number, dashes and spacing are ignored)
await getChartUrl("EKCH RNP RWY 22R – 2"); // → …/EK_AD_2_EKCH_RNP_RWY_22_R_2_en.pdf

// By ICAO code + chart
await getChartUrl({ icao: "EKCH", chart: "ADC" });
await getChartUrl({ icao: "EKCH", chart: "RNP RWY 22L 1" });
await getChartUrl({ icao: "EKCH" }); // AD 2 text section

// Fix an old, dead link
await getChartUrl("https://aim.naviair.dk/media/files/abcdefghijk/EK_AD_2_EKCH_ADC_en.pdf");

// Many charts exist in both the AIP and the VFR Flight Guide. AIP copies win unless you ask:
await getChartUrl("EK_AD_2_EKRK_VAC", { publication: "vfg-dk" });

// Metadata
const chart = await getChart("EKCH ADC");
// { id, name, title: "02. EKCH ADC", url, path: ["AIP Danmark", …, "København Kastrup - EKCH"],
//   publication: "aip-dk", publishAt: Date, unpublishAt: null, parentId }

await getAerodromeCharts("EKBI"); // every current chart for an aerodrome, in NAVIAIR's order
await searchCharts("Checkliste"); // same as the search box on aim.naviair.dk
```

Unknown charts reject with `ChartNotFoundError`. API failures reject with `NaviairApiError`.

### How queries are matched

A string query is tried in this order:

1. **File name**: the chart's name in NAVIAIR's tree (e.g. `EK_AD_2_EKCH_RNP_RWY_22R_2_en.pdf`) or the file name
   in its current URL (sometimes different, e.g. `…_22_R_2_en.pdf`). A full URL works too.
2. **Display title**, ignoring the ordering prefix, case, spacing and dashes: `82. EKCH RNP RWY 22R – 2`,
   `EKCH RNP RWY 22R - 2` and `ekch rnp rwy 22r 2` are all the same chart.
3. **`ICAO chart`**, matching the chart part of the file name loosely: `EKCH ILS or LOC RWY 12 1`.
4. **Wider search** for file names that only appear in URLs (`BG_GEN_0_4_en_A_08-26.pdf`).

If several versions are listed at once (for example during an AIRAC changeover), the one in effect now, based on
`publishAt`/`unpublishAt`, is returned.

### Publications

| key      | publication                                        |
| -------- | -------------------------------------------------- |
| `aip-dk` | AIP Danmark                                        |
| `vfg-dk` | VFR Flight Guide Danmark                           |
| `aip-fo` | AIP Færøerne                                       |
| `aip-gl` | AIP Grønland                                       |
| `aic-a`  | Aeronautical Information Circulars – AIC series A |
| `aic-b`  | Aeronautical Information Circulars – AIC series B |
| `dqr`    | DQR – Non compliant list                           |

### Client options

The top-level functions share one default client. Create your own to change settings:

```ts
import { NaviairClient } from "naviair-charts";

const client = new NaviairClient({
  cacheTtl: 5 * 60_000, // cache resolved lookups for 5 minutes (default 15; 0 = off)
  fetch: myFetch,       // custom fetch (proxies, tests)
  baseUrl: "https://aim.naviair.dk",
});
await client.getChartUrl("EKCH ADC");
await client.crawl();   // walk the whole tree (~200 requests) → { folders, charts }
```

### Chart list for autocomplete

The package includes a snapshot of every chart name and folder, taken when the package was published:

```ts
import { catalogue } from "naviair-charts";
catalogue.charts; // [{ id, name, title, parentId }, …]  — names only; resolve URLs with getChartUrl()
```

## Permanent links: redirect server

For links you can share, bookmark or put in an EFB or wiki, run the bundled redirect server:

```sh
npx naviair-charts serve --port 8080
```

| request                                        | response                                |
| ---------------------------------------------- | --------------------------------------- |
| `GET /charts/EK_AD_2_EKCH_ADC_en.pdf`           | `302` → current PDF                     |
| `GET /charts/EKCH/ADC`                         | `302` → current PDF                     |
| `GET /charts/EKCH%20RNP%20RWY%2022R%20-%202`   | `302` → current PDF                     |
| `GET /charts/EKCH/ADC?format=json`             | chart metadata                          |
| `GET /charts/…?publication=vfg-dk`             | pick a specific publication             |
| `GET /aerodromes/EKCH`                         | JSON list of the aerodrome's charts     |
| `GET /search?q=Checkliste`                     | JSON search results                     |
| `GET /health`                                  | `{ "ok": true }`                        |

`http://your-host:8080/charts/EKCH/ADC` keeps pointing to the current EKCH ADC after every AIRAC update.

To mount it inside an existing app (plain `node:http`, Express, Connect):

```ts
import express from "express";
import { createHandler } from "naviair-charts/server";

const app = express();
app.use(createHandler({ basePath: "/naviair" })); // → /naviair/charts/EKCH/ADC
```

## CLI

```sh
npx naviair-charts url EK_AD_2_EKCH_ADC_en.pdf
npx naviair-charts url EKCH ADC
npx naviair-charts url "EKCH RNP RWY 22R – 2"
npx naviair-charts url EKRK VAC --publication vfg-dk
npx naviair-charts info EKCH GMC 1        # JSON metadata
npx naviair-charts aerodrome EKCH         # list current charts
npx naviair-charts search Checkliste
npx naviair-charts serve --port 8080
```

## Development

```sh
npm install
npm test           # offline tests with a fake API
npm run test:live  # checks against aim.naviair.dk
npm run crawl      # refresh the bundled catalogue snapshot (src/catalogue.json)
npm run build
npm run site       # local test site at http://localhost:3000
```

See [PUBLISHING.md](PUBLISHING.md) for the release process.

## Disclaimer

Not affiliated with or endorsed by NAVIAIR. This package uses the same JSON endpoints as the aim.naviair.dk website;
they are not a documented API and may change without notice. Lookups are cached for 15 minutes by default, so
please keep the load on NAVIAIR's servers reasonable.

The package only returns links to NAVIAIR's own PDFs and makes no guarantee that they are complete or current. Always
check aeronautical information against official sources before flight.

## License

[MIT](LICENSE)
