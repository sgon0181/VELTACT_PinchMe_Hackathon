import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";
import {
  demoCommercialDraftForAction,
  demoCommercialFillAction,
  emptySupplierCommercialDraft
} from "../public/assets/supplierClaimCommercialDraft.js";

test("supplier claim polling cannot overwrite an edited form", async () => {
  const bundle = await readFile(
    new URL("../public/assets/supplierClaim.js", import.meta.url),
    "utf8"
  );

  assert.match(bundle, /let formDirty = false/);
  assert.match(bundle, /!formDirty/);
  assert.match(bundle, /closest\("form"\)/);
  assert.match(bundle, /formDirty = true/);
  assert.match(bundle, /if \(form\.isConnected\)/);
  assert.match(bundle, /else \{\s*render\(\)/);
});

describe("supplier claim commercial draft integrity", () => {
  test("starts every private commercial response with blank supplier-owned fields", () => {
    assert.deepEqual(emptySupplierCommercialDraft(), {
      source: "blank",
      availability: "",
      indicativePriceAud: "",
      relevantExperience: "",
      proposedApproach: "",
      assumptions: "",
      conditions: ""
    });
  });

  test("requires both the explicit demo action and an enabled health gate", () => {
    assert.equal(
      demoCommercialDraftForAction(
        demoCommercialFillAction,
        false,
        false
      ),
      undefined
    );
    assert.equal(
      demoCommercialDraftForAction("refresh", true, false),
      undefined
    );

    const fixture = demoCommercialDraftForAction(
      demoCommercialFillAction,
      true,
      false
    );
    assert.equal(fixture?.source, "demo_fixture");
    assert.equal(fixture?.indicativePriceAud, "6500");
    assert.match(fixture?.availability ?? "", /four hours/);
  });

  test("keeps the robotics fixture isolated from subsequent blank drafts", () => {
    const fixture = demoCommercialDraftForAction(
      demoCommercialFillAction,
      true,
      true
    );
    assert.equal(fixture?.source, "demo_fixture");
    assert.equal(fixture?.indicativePriceAud, "78000");
    assert.match(fixture?.proposedApproach ?? "", /commissioning/);
    assert.equal(emptySupplierCommercialDraft().indicativePriceAud, "");
  });
});
