import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { ChartNotFoundError, NaviairClient } from "../src/client.ts";
import type { RawNode } from "../src/types.ts";

const FIXTURE: RawNode[] = JSON.parse(readFileSync(new URL("./fixtures/nodes.json", import.meta.url), "utf8"));

/** A fake aim.naviair.dk API over a list of nodes. Search matches name/title substrings, like the real one. */
function fakeApi(nodes: RawNode[], calls: string[] = []): typeof fetch {
  return async (input) => {
    const url = new URL(String(input));
    calls.push(url.pathname + url.search);
    const p = url.searchParams;
    let body: unknown;
    if (url.pathname.endsWith("/getsearch")) {
      const q = p.get("criterion")!.toLowerCase();
      const hits = nodes.filter((n) => n.name.toLowerCase().includes(q) || n.title.toLowerCase().includes(q));
      const skip = Number(p.get("skip")), take = Number(p.get("take"));
      body = { nodes: hits.slice(skip, skip + take), total: hits.length };
    } else if (url.pathname.endsWith("/getnodesforparent")) {
      body = nodes.filter((n) => n.parentId === Number(p.get("parentId") || 0));
    } else {
      return new Response("not found", { status: 404 });
    }
    return Response.json(body);
  };
}

const client = (nodes = FIXTURE, extra: Partial<ConstructorParameters<typeof NaviairClient>[0]> = {}) =>
  new NaviairClient({ fetch: fakeApi(nodes), now: () => new Date("2026-09-30T12:00:00Z"), ...extra });

describe("getChartUrl", () => {
  it("resolves a file name to the current href", async () => {
    assert.equal(
      await client().getChartUrl("EK_AD_2_EKCH_ADC_en.pdf"),
      "https://aim.naviair.dk/media/files/kfgqtlumuoo/EK_AD_2_EKCH_ADC_en.pdf",
    );
  });

  it("ignores case, .pdf and _en", async () => {
    const c = client();
    const want = await c.getChartUrl("EK_AD_2_EKCH_ADC_en.pdf");
    assert.equal(await c.getChartUrl("ek_ad_2_ekch_adc"), want);
    assert.equal(await c.getChartUrl("EK_AD_2_EKCH_ADC_en"), want);
  });

  it("prefers the AIP copy, or the requested publication", async () => {
    const c = client();
    assert.equal((await c.getChart("EK_AD_2_EKCH_ADC_en.pdf")).publication, "aip-dk");
    const vfg = await c.getChart("EK_AD_2_EKCH_ADC_en.pdf", { publication: "vfg-dk" });
    assert.equal(vfg.publication, "vfg-dk");
    assert.deepEqual(vfg.path.slice(0, 1), ["VFR Flight Guide Danmark"]);
  });

  it("resolves ICAO + chart", async () => {
    const c = client();
    assert.match(await c.getChartUrl({ icao: "ekch", chart: "adc" }), /EK_AD_2_EKCH_ADC_en\.pdf$/);
    assert.match(await c.getChartUrl({ icao: "EKCH" }), /EK_AD_2_EKCH_en\.pdf$/);
    assert.match(await c.getChartUrl({ icao: "EKCH", chart: "text" }), /EK_AD_2_EKCH_en\.pdf$/);
    assert.equal((await c.getChart({ icao: "EKCH", chart: "RNP RWY 22L 2" })).name, "EK_AD_2_EKCH_RNP_RWY_22L_2_en.pdf");
    assert.equal((await c.getChart({ icao: "EKCH", chart: "RNP_RWY_22_R_3" })).name, "EK_AD_2_EKCH_RNP_RWY_22_R_3_en.pdf");
    assert.equal((await c.getChart({ icao: "EKRB", chart: "HELC" })).name, "EK_EKRB_HELC_en.pdf");
  });

  it("resolves display titles", async () => {
    const c = client();
    for (const q of ["EKCH RNP RWY 22R – 2", "82. EKCH RNP RWY 22R – 2", "EKCH RNP RWY 22R - 2", "ekch rnp rwy 22r 2"]) {
      assert.equal((await c.getChart(q)).name, "EK_AD_2_EKCH_RNP_RWY_22R_2_en.pdf", q);
    }
    assert.equal((await c.getChart("AIC B Checkliste")).name, "EK_AIC_Check_2026_09_16_en.pdf");
  });

  it("fixes stale links and href-only file names", async () => {
    const c = client();
    assert.match(
      await c.getChartUrl("https://aim.naviair.dk/media/files/deadbeef000/EK_AD_2_EKCH_ADC_en.pdf"),
      /\/kfgqtlumuoo\//,
    );
    // Node is EK_AD_2_EKCH_RNP_RWY_22L_2_en.pdf but the PDF is served as ..._22_L_2_en.pdf
    assert.equal((await c.getChart("EK_AD_2_EKCH_RNP_RWY_22_L_2_en.pdf")).name, "EK_AD_2_EKCH_RNP_RWY_22L_2_en.pdf");
    assert.equal((await c.getChart("BG_GEN_0_4_en_A_08-26.pdf")).name, "BG_GEN_0_4_en.pdf");
  });

  it("throws ChartNotFoundError", async () => {
    await assert.rejects(client().getChartUrl("EK_AD_2_XXXX_ADC"), ChartNotFoundError);
    await assert.rejects(client().getChartUrl("EKCH nope"), ChartNotFoundError);
    await assert.rejects(client().getChartUrl("EK_AD_2_EKVG_VAC", { publication: "vfg-dk" }), /not in vfg-dk/);
  });

  it("picks the version in effect when an old and a new one are listed", async () => {
    const current = FIXTURE.find((n) => n.name === "EK_AD_2_EKCH_ADC_en.pdf" && n.parentId === 378)!;
    const nodes = [
      ...FIXTURE.filter((n) => n !== current),
      { ...current, id: 1, href: "/media/files/old/x.pdf", publishAt: "2026-01-01T00:00:00Z", unpublishAt: "2026-09-01T00:00:00Z" },
      { ...current, id: 2, href: "/media/files/now/x.pdf", publishAt: "2026-09-01T00:00:00Z" },
      { ...current, id: 3, href: "/media/files/next/x.pdf", publishAt: "2026-10-29T00:00:00Z" },
    ];
    assert.equal(await client(nodes).getChartUrl("EK_AD_2_EKCH_ADC_en.pdf"), "https://aim.naviair.dk/media/files/now/x.pdf");
  });

  it("caches lookups", async () => {
    const calls: string[] = [];
    const c = new NaviairClient({ fetch: fakeApi(FIXTURE, calls) });
    await c.getChartUrl("EK_AD_2_EKCH_ADC_en.pdf");
    await c.getChartUrl("EK_AD_2_EKCH_ADC_en.pdf");
    assert.equal(calls.length, 1);
  });

  it("learns folders added after the bundled snapshot", async () => {
    const c = client(FIXTURE, { catalogue: { generatedAt: "", folders: {}, charts: [] } });
    const chart = await c.getChart("EK_AD_2_EKCH_ADC_en.pdf");
    assert.equal(chart.publication, "aip-dk");
    assert.equal(chart.path.at(-1), "København Kastrup - EKCH");
  });
});

describe("getAerodromeCharts", () => {
  it("lists one publication's charts in display order", async () => {
    const charts = await client().getAerodromeCharts("EKCH");
    assert.ok(charts.every((c) => c.publication === "aip-dk"));
    assert.equal(charts[0]!.name, "EK_AD_2_EKCH_en.pdf");
    assert.deepEqual(
      charts.map((c) => c.title.split(".")[0]),
      charts.map((c) => c.title.split(".")[0]).sort((a, b) => Number(a) - Number(b)),
    );
    const vfg = await client().getAerodromeCharts("EKCH", { publication: "vfg-dk" });
    assert.ok(vfg.length > 0 && vfg.every((c) => c.publication === "vfg-dk"));
  });
});

