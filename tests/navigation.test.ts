import test from "node:test";
import assert from "node:assert/strict";
import { tmapDirectionsUrl } from "../src/lib/navigation";

test("TMAP route navigates to the address using longitude then latitude", () => {
  const address = "경기 성남시 분당구 내정로7번길 14(정자동)";
  const url = tmapDirectionsUrl({ address, lat: 37.3608, lng: 127.1132 });
  assert.equal(url, `tmap://route?goalname=${encodeURIComponent(address)}&goalx=127.1132&goaly=37.3608`);
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("goalname"), address);
  assert.equal(parsed.searchParams.get("goalx"), "127.1132");
  assert.equal(parsed.searchParams.get("goaly"), "37.3608");
});
