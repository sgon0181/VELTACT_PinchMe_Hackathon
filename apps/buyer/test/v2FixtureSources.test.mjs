import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("V2 fixture suppliers do not expose knowingly dead source links", async () => {
  const v2Bundle = await readFile(
    new URL("../public/assets/v2.js", import.meta.url),
    "utf8"
  );

  assert.match(v2Bundle, /Fixture source \(no external website\)/);
  assert.match(v2Bundle, /lead\.sourceMode === "fixture"/);
  assert.match(v2Bundle, /url\.hostname\.endsWith\("\.example"\)/);
});
