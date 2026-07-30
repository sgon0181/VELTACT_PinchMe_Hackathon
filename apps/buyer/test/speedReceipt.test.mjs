import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const mainBundle = await readFile(
  new URL("../public/assets/main.js", import.meta.url),
  "utf8"
);
const serviceBundle = await readFile(
  new URL("../public/assets/rapidMatchService.js", import.meta.url),
  "utf8"
);
const contractBundle = await readFile(
  new URL("../public/assets/vendor/contracts/index.js", import.meta.url),
  "utf8"
);
const styles = await readFile(
  new URL("../public/styles.css", import.meta.url),
  "utf8"
);

const helperStart = mainBundle.indexOf("function formatReceiptElapsed");
const helperEnd = mainBundle.indexOf(
  "\nfunction renderSpeedReceipt",
  helperStart
);
assert.notEqual(helperStart, -1, "receipt elapsed formatter should exist");
assert.notEqual(helperEnd, -1, "receipt elapsed formatter should be bounded");
const sandbox = {};
vm.runInNewContext(
  `${mainBundle.slice(helperStart, helperEnd)}
this.formatReceiptElapsed = formatReceiptElapsed;`,
  sandbox
);

test("formats the recorded secured interval without inventing precision", () => {
  assert.equal(sandbox.formatReceiptElapsed(0), "<1s");
  assert.equal(sandbox.formatReceiptElapsed(41_000), "41s");
  assert.equal(sandbox.formatReceiptElapsed(581_000), "9m 41s");
  assert.equal(sandbox.formatReceiptElapsed(7_440_000), "2h 4m");
});

test("renders the receipt on the selected, payment and deployment states", () => {
  assert.match(mainBundle, /Speed receipt/);
  assert.match(mainBundle, /Secured in/);
  assert.match(mainBundle, /Supplier securing in progress/);
  assert.match(mainBundle, /receipt\.baseline\.label/);
  assert.match(contractBundle, /Industry norm: days to weeks/);
  assert.match(mainBundle, /General claim/);
  assert.match(mainBundle, /data-print-receipt/);
  assert.match(mainBundle, /renderSelected[\s\S]*renderSpeedReceipt/);
  assert.match(mainBundle, /renderPayment[\s\S]*renderSpeedReceipt/);
  assert.match(mainBundle, /renderDeployment[\s\S]*renderSpeedReceipt/);
});

test("loads the buyer-scoped receipt and provides one-page print styling", () => {
  assert.match(serviceBundle, /loadSpeedReceipt/);
  assert.match(serviceBundle, /engagementReceipt/);
  assert.match(serviceBundle, /x-veltact-buyer-token/);
  assert.match(styles, /@media print/);
  assert.match(styles, /@page[\s\S]*size: A4/);
  assert.match(
    styles,
    /\.speed-receipt,[\s\S]*\.speed-receipt \*[\s\S]*visibility: visible/
  );
  assert.match(styles, /\.speed-receipt-actions[\s\S]*display: none/);
});
