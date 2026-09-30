import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { NaviairClient } from "../src/client.ts";
import { startServer } from "../src/server.ts";
import type { RawNode } from "../src/types.ts";

const FIXTURE: RawNode[] = JSON.parse(readFileSync(new URL("./fixtures/nodes.json", import.meta.url), "utf8"));

const fakeFetch: typeof fetch = async (input) => {
  const url = new URL(String(input));
  const q = url.searchParams.get("criterion")?.toLowerCase();
  if (q === undefined) return Response.json(FIXTURE.filter((n) => n.parentId === Number(url.searchParams.get("parentId") || 0)));
  const hits = FIXTURE.filter((n) => n.name.toLowerCase().includes(q) || n.title.toLowerCase().includes(q));
  return Response.json({ nodes: hits, total: hits.length });
};

describe("server", () => {
  let base = "";
  let close = () => {};
  before(async () => {
    const server = await startServer({ port: 0, client: new NaviairClient({ fetch: fakeFetch }) });
    base = `http://localhost:${(server.address() as AddressInfo).port}`;
    close = () => server.close();
  });
  after(() => close());

  const get = (path: string) => fetch(base + path, { redirect: "manual" });

  it("redirects /charts/<file name>", async () => {
    const res = await get("/charts/EK_AD_2_EKCH_ADC_en.pdf");
    assert.equal(res.status, 302);
    assert.equal(res.headers.get("location"), "https://aim.naviair.dk/media/files/kfgqtlumuoo/EK_AD_2_EKCH_ADC_en.pdf");
  });

  it("redirects /charts/<ICAO>/<chart> and titles", async () => {
    assert.match((await get("/charts/EKCH/ADC")).headers.get("location")!, /EK_AD_2_EKCH_ADC_en\.pdf$/);
    assert.match(
      (await get("/charts/EKCH%20RNP%20RWY%2022R%20%E2%80%93%202")).headers.get("location")!,
      /EK_AD_2_EKCH_RNP_RWY_22_R_2_en\.pdf$/,
    );
  });

  it("returns JSON on request, 404 when missing, 400 on bad publication", async () => {
    const json = await (await get("/charts/EKCH/ADC?format=json&publication=vfg-dk")).json();
    assert.equal(json.publication, "vfg-dk");
    assert.equal((await get("/charts/EKCH/NOPE")).status, 404);
    assert.equal((await get("/charts/EKCH/ADC?publication=xx")).status, 400);
    assert.equal((await get("/elsewhere")).status, 404);
    assert.equal((await get("/charts/%E0%A4%A")).status, 400);
    assert.equal((await get("/health")).status, 200); // still alive
  });

  it("lists aerodrome charts and search results", async () => {
    const charts = await (await get("/aerodromes/EKCH")).json();
    assert.equal(charts[0].name, "EK_AD_2_EKCH_en.pdf");
    const hits = await (await get("/search?q=Checkliste")).json();
    assert.ok(hits.some((c: { name: string }) => c.name === "EK_AIC_Check_2026_09_16_en.pdf"));
  });
});
