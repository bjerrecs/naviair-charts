// Test site for naviair-charts: npm run site → http://localhost:3000
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { NaviairClient } from "../src/client.ts";
import { createHandler } from "../src/server.ts";

const port = Number(process.env.PORT ?? 3000);
const client = new NaviairClient();
const api = createHandler({ client });
const page = new URL("./index.html", import.meta.url);
const catalogue = new URL("../src/catalogue.json", import.meta.url);

async function serve(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  if (path === "/" || path === "/index.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    return void res.end(await readFile(page));
  }
  if (path === "/catalogue.json") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    return void res.end(await readFile(catalogue));
  }
  const started = Date.now();
  await api(req, res);
  console.log(`${req.method} ${req.url} → ${res.statusCode} (${Date.now() - started} ms)`);
}

createServer((req, res) => {
  serve(req, res).catch((err) => {
    console.error(err);
    if (!res.headersSent) res.writeHead(500).end();
  });
}).listen(port, () => console.log(`naviair-charts test site: http://localhost:${port}`));
