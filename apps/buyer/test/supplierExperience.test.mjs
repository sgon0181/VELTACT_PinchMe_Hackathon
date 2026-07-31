import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";
import {
  supplierClaimComplete,
  supplierDocumentUrl
} from "../public/supplierFlow.js";

describe("concise token-scoped supplier experience", () => {
  test("requires the canonical claim state before response submission", () => {
    assert.equal(supplierClaimComplete(undefined), false);
    assert.equal(
      supplierClaimComplete({ status: "supplier_profile_approved" }),
      false
    );
    assert.equal(supplierClaimComplete({ status: "claimed" }), true);
  });

  test("uses the reserved token-scoped RFQ and quote routes", () => {
    assert.equal(
      supplierDocumentUrl(
        "https://demo.veltact.test/api",
        "private token",
        "rfq"
      ),
      "https://demo.veltact.test/api/supplier-invitations/private%20token/rfq.pdf"
    );
    assert.equal(
      supplierDocumentUrl(
        "https://demo.veltact.test/api",
        "private token",
        "quote"
      ),
      "https://demo.veltact.test/api/supplier-invitations/private%20token/quote.pdf"
    );
    assert.throws(
      () =>
        supplierDocumentUrl(
          "https://demo.veltact.test/api",
          "private token",
          "other"
        ),
      /Unknown supplier document kind/
    );
  });

  test("keeps the RFQ visible before submission and quote download on the receipt", async () => {
    const [html, script] = await Promise.all([
      readFile(new URL("../public/supplier.html", import.meta.url), "utf8"),
      readFile(new URL("../public/supplier.js", import.meta.url), "utf8")
    ]);

    assert.match(html, /id="download-rfq"/);
    assert.match(html, /id="download-quote"/);
    assert.match(script, /await claimInvitation\(invitationToken, formData\)/);
    assert.match(script, /await postSupplierResponse\(/);
    assert.match(script, /reasons\.slice\(0, 3\)/);
    assert.match(script, /setFormValueIfEmpty\("companyName"/);
    assert.match(
      script,
      /Complete the required company and contact fields before submitting/
    );
    assert.doesNotMatch(
      script,
      /setFormValue\("sourceDisclosureAccepted"/
    );
    assert.ok(
      script.indexOf("await claimInvitation") <
        script.indexOf("await postSupplierResponse")
    );
  });

  test("moves keyboard focus to each newly revealed supplier state", async () => {
    const [html, script] = await Promise.all([
      readFile(new URL("../public/supplier.html", import.meta.url), "utf8"),
      readFile(new URL("../public/supplier.js", import.meta.url), "utf8")
    ]);

    for (const headingId of [
      "page-state-title",
      "response-form-title",
      "receipt-title"
    ]) {
      assert.match(
        html,
        new RegExp(`id="${headingId}" tabindex="-1"`)
      );
      assert.match(script, new RegExp(`focusHeading\\("#${headingId}"\\)`));
    }
  });

  test("restores unsent commercial fields and clears them after submission", async () => {
    const script = await readFile(
      new URL("../public/supplier.js", import.meta.url),
      "utf8"
    );

    assert.match(script, /form\.addEventListener\("input", persistResponseDraftFromEvent\)/);
    assert.match(script, /restoreResponseDraft\(\)/);
    assert.match(script, /writeSupplierResponseDraft\(/);
    assert.match(script, /clearResponseDraft\(\)/);
    assert.ok(
      script.indexOf("clearResponseDraft();") <
        script.indexOf('focusHeading("#receipt-title")')
    );
  });
});
