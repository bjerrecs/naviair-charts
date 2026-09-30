#!/usr/bin/env node
import { parseArgs } from "node:util";
import { ChartNotFoundError, NaviairClient, PUBLICATIONS, type ChartQuery } from "./client.ts";
import { startServer } from "./server.ts";
import type { Chart, Publication } from "./types.ts";

const HELP = `Usage: naviair-charts <command> [options]

Commands:
  url <file name>              Print the current PDF URL, e.g. EK_AD_2_EKCH_ADC_en.pdf
  url <ICAO> <chart>           Same, by aerodrome + chart, e.g. EKCH ADC / EKCH "RNP RWY 22L 1"
  info <file name | ICAO chart>  Print chart metadata as JSON
  aerodrome <ICAO>             List an aerodrome's current charts
  search <text>                Search aim.naviair.dk
  serve                        Run a redirect server: /charts/<file name>, /charts/<ICAO>/<chart>

Options:
  -p, --publication <key>      ${PUBLICATIONS.join(" | ")}
      --json                   JSON output (aerodrome, search)
      --port <n>               serve: port (default 8080, or $PORT)
      --host <host>            serve: interface to bind
  -h, --help
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    publication: { type: "string", short: "p" },
    json: { type: "boolean" },
    port: { type: "string" },
    host: { type: "string" },
    help: { type: "boolean", short: "h" },
  },
});

const [command, ...args] = positionals;
const publication = values.publication as Publication | undefined;
if (publication && !PUBLICATIONS.includes(publication)) fail(`Unknown publication "${publication}".`);
const client = new NaviairClient();

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function toQuery(args: string[]): ChartQuery {
  if (args.length === 1) return args[0]!;
  if (args.length >= 2) return { icao: args[0]!, chart: args.slice(1).join(" ") };
  fail("Missing chart. Example: naviair-charts url EKCH ADC");
}

function table(charts: Chart[]): void {
  if (values.json) return console.log(JSON.stringify(charts, null, 2));
  for (const c of charts) console.log(`${c.title.padEnd(48)} ${c.url}`);
}

try {
  switch (command) {
    case "url":
      console.log(await client.getChartUrl(toQuery(args), { publication }));
      break;
    case "info":
      console.log(JSON.stringify(await client.getChart(toQuery(args), { publication }), null, 2));
      break;
    case "aerodrome":
    case "ad":
      if (!args[0]) fail("Missing ICAO code. Example: naviair-charts aerodrome EKCH");
      table(await client.getAerodromeCharts(args[0], { publication }));
      break;
    case "search":
      if (!args.length) fail("Missing search text.");
      table(await client.search(args.join(" "), { publication }));
      break;
    case "serve": {
      const port = Number(values.port ?? process.env.PORT ?? 8080);
      await startServer({ client, port, host: values.host });
      console.log(`naviair-charts listening on http://${values.host ?? "localhost"}:${port}`);
      console.log(`  try http://${values.host ?? "localhost"}:${port}/charts/EKCH/ADC`);
      break;
    }
    default:
      console.log(HELP);
      process.exit(values.help || !command ? 0 : 1);
  }
} catch (err) {
  fail(err instanceof ChartNotFoundError || err instanceof TypeError ? err.message : String(err));
}
