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
    assert.ok(
      script.indexOf("await claimInvitation") <
        script.indexOf("await postSupplierResponse")
    );
  });
});
