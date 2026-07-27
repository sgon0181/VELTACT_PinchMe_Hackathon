import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const v2Bundle = await readFile(
  new URL("../public/assets/v2.js", import.meta.url),
  "utf8"
);

test("labels V2 local-demo milestone evidence as non-authoritative", () => {
  assert.match(
    v2Bundle,
    /Record non-authoritative demo evidence/
  );
  assert.match(
    v2Bundle,
    /Non-authoritative local demo evidence/
  );
  assert.match(
    v2Bundle,
    /prototype advanced without a live Pinch transaction or provider approval/
  );
  assert.match(
    v2Bundle,
    /localDemoPaymentAvailable\s*&&\s*paymentLink\?\.kind === "local_demo"/
  );
});

test("reserves authoritative evidence wording for Pinch", () => {
  assert.match(v2Bundle, /Authoritative Pinch evidence/);
  assert.match(
    v2Bundle,
    /Live funding requires backend-verified Pinch evidence/
  );
});

test("distinguishes local returns from genuine Pinch checkout links", () => {
  assert.match(v2Bundle, /Create hosted payment link/);
  assert.match(v2Bundle, /Open local demo return/);
  assert.match(v2Bundle, /Synthetic local return \/ no external payment/);
  assert.match(v2Bundle, /Open Pinch checkout/);
  assert.match(v2Bundle, /hostname\.endsWith\("\.getpinch\.com\.au"\)/);
});
