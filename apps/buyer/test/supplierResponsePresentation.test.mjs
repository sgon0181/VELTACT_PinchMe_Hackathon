import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const mainBundle = await readFile(
  new URL("../public/assets/main.js", import.meta.url),
  "utf8"
);
const helperStart = mainBundle.indexOf(
  "function supplierResponsePriceLabel"
);
const helperEnd = mainBundle.indexOf("\nfunction ", helperStart + 1);

assert.notEqual(helperStart, -1, "supplier price helper should exist");
assert.notEqual(helperEnd, -1, "supplier price helper should be bounded");

const sandbox = {
  money(amount, currency) {
    return `${currency} ${amount}`;
  }
};
vm.runInNewContext(
  `${mainBundle.slice(helperStart, helperEnd)}
this.supplierResponsePriceLabel = supplierResponsePriceLabel;`,
  sandbox
);

test("declined responses never present a zero-dollar quote", () => {
  assert.equal(
    sandbox.supplierResponsePriceLabel({
      decision: "cannot_help",
      indicativePrice: { amount: 0, currency: "AUD" }
    }),
    "Not provided"
  );
});

test("can-help responses retain their indicative price", () => {
  assert.equal(
    sandbox.supplierResponsePriceLabel({
      decision: "can_help",
      indicativePrice: { amount: 4_450_000, currency: "AUD" }
    }),
    "AUD 4450000"
  );
});
