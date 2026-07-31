import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buyerWorkspacePresentationSignature } from "../public/assets/workspacePresentation.js";

const mainBundle = await readFile(
  new URL("../public/assets/main.js", import.meta.url),
  "utf8"
);

test("ignores generated receipt timestamps but detects visible workspace changes", () => {
  const first = {
    status: "supplier_outreach",
    speedReceipt: { generatedAt: "2026-07-31T00:00:00.000Z" },
    responses: []
  };
  const samePresentation = {
    ...first,
    speedReceipt: { generatedAt: "2026-07-31T00:00:05.000Z" }
  };
  const changed = {
    ...samePresentation,
    responses: [{ id: "response-1" }]
  };

  assert.equal(
    buyerWorkspacePresentationSignature(first),
    buyerWorkspacePresentationSignature(samePresentation)
  );
  assert.notEqual(
    buyerWorkspacePresentationSignature(first),
    buyerWorkspacePresentationSignature(changed)
  );
});

test("buyer rerenders preserve focus, disclosures and text selection", () => {
  assert.match(mainBundle, /captureRenderInteractionState\(app\)/);
  assert.match(mainBundle, /restoreRenderInteractionState\(app,/);
  assert.match(mainBundle, /querySelectorAll\("details\[open\]"\)/);
  assert.match(mainBundle, /setSelectionRange\(/);
  assert.match(mainBundle, /textControl\.selectionStart !== null/);
  assert.match(
    mainBundle,
    /presentationChanged && !milestoneUpdateFormHasFocus\(\)/
  );
});
