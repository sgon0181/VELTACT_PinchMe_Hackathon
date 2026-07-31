import assert from "node:assert/strict";
import test from "node:test";
import { dedupeIntakeMissingFields } from "../public/assets/intakeMissingFields.js";

test("deduplicates semantically equivalent intake missing-field labels", () => {
  assert.deepEqual(
    dedupeIntakeMissingFields([
      "equipment or technology",
      "Equipment Or Technology",
      "required supplier capability",
      "required supplier capabilities",
      "buyer contact email",
      "contact email",
      "photo evidence content",
      "photo visual interpretation (live AI required)"
    ]),
    [
      "equipment or technology",
      "required supplier capability",
      "buyer contact email",
      "photo evidence content"
    ]
  );
});
