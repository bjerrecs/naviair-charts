// Hits aim.naviair.dk for real: npm run test:live
import assert from "node:assert/strict";
import { it } from "node:test";
import { NaviairClient } from "../src/client.ts";

const client = new NaviairClient();

for (const query of ["EK_AD_2_EKCH_ADC_en.pdf", "EKCH RNP RWY 22R – 2", "EKVG VAC", "BGJN ADC"]) {
  it(`resolves ${query} to a live PDF`, async () => {
    const url = await client.getChartUrl(query);
    const res = await fetch(url, { method: "HEAD" });
    assert.equal(res.status, 200, url);
    assert.equal(res.headers.get("content-type"), "application/pdf");
  });
}

it("bundled catalogue still matches the live folder structure", async () => {
  const roots = await client.getChildren();
  assert.deepEqual(roots.map((r) => r.id).sort((a, b) => a - b), [1, 265, 295, 812, 1127, 3704, 4240]);
});
