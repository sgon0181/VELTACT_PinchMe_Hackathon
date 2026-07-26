import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseUrgencyDays } from "../public/assets/urgency.js";

describe("buyer urgency parsing", () => {
  test("converts eight weeks to 56 days", () => {
    assert.equal(parseUrgencyDays("Commission within 8 weeks"), 56);
  });

  test("converts two weeks to 14 days", () => {
    assert.equal(parseUrgencyDays("Required in 2 weeks"), 14);
  });

  test("preserves explicit day counts", () => {
    assert.equal(parseUrgencyDays("Required within 10 days"), 10);
  });

  test("maps urgent language to one day", () => {
    assert.equal(parseUrgencyDays("Urgent line recovery tonight"), 1);
  });

  test("leaves unspecified timing undefined", () => {
    assert.equal(parseUrgencyDays("Timing unspecified"), undefined);
  });
});
