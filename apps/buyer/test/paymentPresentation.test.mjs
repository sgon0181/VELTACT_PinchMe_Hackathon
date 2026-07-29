import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const mainBundleUrl = new URL("../public/assets/main.js", import.meta.url);
const mainBundle = await readFile(mainBundleUrl, "utf8");
const helperStart = mainBundle.indexOf("function hostedPaymentKind");
const helperEnd = mainBundle.indexOf("\nfunction renderPayment", helperStart);

assert.notEqual(helperStart, -1, "hosted payment helper should exist");
assert.notEqual(helperEnd, -1, "hosted payment helper should precede renderPayment");

const sandbox = { URL };
vm.runInNewContext(
  `${mainBundle.slice(helperStart, helperEnd)}
this.paymentHelpers = { hostedPaymentKind, paymentLinkPresentation };`,
  sandbox
);
const { hostedPaymentKind, paymentLinkPresentation } = sandbox.paymentHelpers;

const evidenceHelperStart = mainBundle.indexOf(
  "function deploymentPaymentEvidence"
);
const evidenceHelperEnd = mainBundle.indexOf(
  "\nfunction renderDeployment",
  evidenceHelperStart
);

assert.notEqual(
  evidenceHelperStart,
  -1,
  "deployment payment-evidence helper should exist"
);
assert.notEqual(
  evidenceHelperEnd,
  -1,
  "deployment payment-evidence helper should be bounded"
);

const evidenceSandbox = {};
vm.runInNewContext(
  `${mainBundle.slice(evidenceHelperStart, evidenceHelperEnd)}
this.deploymentPaymentEvidence = deploymentPaymentEvidence;`,
  evidenceSandbox
);
const { deploymentPaymentEvidence } = evidenceSandbox;

test("requires both exact local-demo markers before showing synthetic-return copy", () => {
  const localUrl =
    "http://localhost:4000/api/pinch/return/engagement-123" +
    "?payment_provider=local_demo" +
    "&payment_link_id=local_demo_link_engagement-123";

  assert.equal(hostedPaymentKind(localUrl), "local_demo");
  assert.equal(
    paymentLinkPresentation(localUrl).openLabel,
    "Open local demo return"
  );
  assert.equal(
    paymentLinkPresentation(localUrl).boundaryTitle,
    "Synthetic local return"
  );

  assert.equal(
    hostedPaymentKind(
      "https://payments.example/return?payment_provider=local_demo&payment_link_id=link_123"
    ),
    "hosted"
  );
  assert.equal(
    hostedPaymentKind(
      "https://payments.example/return?payment_provider=pinch&payment_link_id=local_demo_link_123"
    ),
    "hosted"
  );
});

test("keeps Pinch wording only for secure GetPinch hosted links", () => {
  const pinch = paymentLinkPresentation(
    "https://sandbox.getpinch.com.au/pay/plk_sandbox"
  );
  assert.equal(pinch.kind, "pinch");
  assert.equal(pinch.openLabel, "Open Pinch payment");
  assert.equal(pinch.readyMessage, "Pinch checkout is ready.");

  const insecure = paymentLinkPresentation(
    "http://sandbox.getpinch.com.au/pay/plk_sandbox"
  );
  const otherProvider = paymentLinkPresentation(
    "https://payments.example/checkout/123"
  );
  assert.equal(insecure.kind, "hosted");
  assert.equal(otherProvider.kind, "hosted");
  assert.equal(otherProvider.openLabel, "Open hosted payment");
});

test("uses provider-neutral copy before a hosted URL exists", () => {
  const uncreated = paymentLinkPresentation();
  assert.equal(uncreated.kind, "uncreated");
  assert.equal(uncreated.eyebrow, "Deploy / Hosted commitment");
  assert.equal(uncreated.openLabel, "Create payment link");
  assert.doesNotMatch(mainBundle, /Create a Pinch commitment/);
  assert.match(mainBundle, /Create a hosted commitment/);
});

test("keeps the development payment utility open across polling rerenders", () => {
  assert.match(
    mainBundle,
    /<details class="developer-utility" open>/
  );
  assert.match(
    mainBundle,
    /localDemoPaymentAvailable\s*&&\s*hostedPaymentKind\(hostedUrl\) === "local_demo"/
  );
});

test("uses explicit local-demo provenance and displays its dedicated evidence ID", () => {
  const evidence = deploymentPaymentEvidence({
    pinchPaymentId: undefined,
    localDemoPaymentId: "demo_local-evidence-123",
    paymentEvidenceProvider: "local_demo",
    paymentEvidenceSource: "local_demo",
    paymentEvidenceAuthoritative: false
  });

  assert.equal(evidence.localDemo, true);
  assert.equal(evidence.evidenceId, "demo_local-evidence-123");
  assert.equal(evidence.authoritative, false);
  assert.equal(evidence.legacyFallback, false);
  assert.match(mainBundle, /using evidence \$\{escapeHtml\(paymentEvidence\.evidenceId\)\}/);
});

test("uses authoritative Pinch provenance even if an old ID resembles demo data", () => {
  const evidence = deploymentPaymentEvidence({
    pinchPaymentId: "demo_but-authoritative",
    localDemoPaymentId: undefined,
    paymentEvidenceProvider: "pinch",
    paymentEvidenceSource: "pinch_webhook",
    paymentEvidenceAuthoritative: true
  });

  assert.equal(evidence.localDemo, false);
  assert.equal(evidence.evidenceId, "demo_but-authoritative");
  assert.equal(evidence.provider, "pinch");
  assert.equal(evidence.authoritative, true);
  assert.equal(evidence.legacyFallback, false);
});

test("retains the legacy demo-ID fallback only when explicit provenance is absent", () => {
  const evidence = deploymentPaymentEvidence({
    pinchPaymentId: "demo_legacy-123"
  });

  assert.equal(evidence.localDemo, true);
  assert.equal(evidence.evidenceId, "demo_legacy-123");
  assert.equal(evidence.legacyFallback, true);
});

test("keeps deployment labels aligned with the active scenario milestone", () => {
  assert.match(mainBundle, /Deploy \/ Active project/);
  assert.match(
    mainBundle,
    /Keep \$\{escapeHtml\(currentMilestoneTitle\)\} status current/
  );
  assert.doesNotMatch(mainBundle, /Deploy \/ Site Assessment project/);
  assert.doesNotMatch(mainBundle, /Keep Site Assessment status current/);
});
