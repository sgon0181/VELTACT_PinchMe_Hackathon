import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderTextPdf } from "./pdfDocument.js";

describe("supplier PDF text wrapping", () => {
  test("splits an unbroken token before it can exceed a content line", () => {
    const token = "W".repeat(200);
    const pdfText = renderTextPdf({
      title: "Long-token wrapping",
      subtitle: "Supplier document",
      reference: "reference-123",
      sections: [
        {
          heading: "Requirement",
          lines: [`Evidence reference: ${token}`]
        }
      ],
      footer: "Decision-support material."
    }).toString("ascii");
    const renderedTokenChunks = pdfText.match(/W+/g) ?? [];

    assert.equal(renderedTokenChunks.join(""), token);
    assert.ok(renderedTokenChunks.length > 1);
    assert.ok(renderedTokenChunks.every((chunk) => chunk.length <= 48));
    assert.doesNotMatch(pdfText, /W{49}/);
  });
});
