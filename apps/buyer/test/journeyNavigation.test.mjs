import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const mainBundle = await readFile(
  new URL("../public/assets/main.js", import.meta.url),
  "utf8"
);

const restoreStart = mainBundle.indexOf("function resolveRestoredView");
const restoreEnd = mainBundle.indexOf(
  "\nfunction resetRequirementState",
  restoreStart
);
const journeyStart = mainBundle.indexOf("function workflowJourneyPhase");
const journeyEnd = mainBundle.indexOf(
  "\nfunction navigateToJourneyPhase",
  journeyStart
);
const responsesStart = mainBundle.indexOf("function submittedResponses");
const responsesEnd = mainBundle.indexOf(
  "\nfunction supplierFor",
  responsesStart
);

for (const [label, position] of [
  ["restore helper", restoreStart],
  ["restore helper end", restoreEnd],
  ["journey helpers", journeyStart],
  ["journey helpers end", journeyEnd],
  ["response helpers", responsesStart],
  ["response helpers end", responsesEnd]
]) {
  assert.notEqual(position, -1, `${label} should exist`);
}

const sandbox = {
  supplierCandidates(data) {
    return data.discoveredSuppliers.length
      ? data.discoveredSuppliers
      : data.matches;
  }
};
vm.runInNewContext(
  `${mainBundle.slice(restoreStart, restoreEnd)}
${mainBundle.slice(journeyStart, journeyEnd)}
${mainBundle.slice(responsesStart, responsesEnd)}
this.journeyHelpers = {
  resolveRestoredView,
  workflowJourneyPhase,
  isHistoricalJourneyPhase,
  hasSingleComparableResponse,
  canReviewSupplierComparison,
  canSelectSupplierFromComparison,
  journeyViewForPhase,
  resolveLegalBuyerView
};`,
  sandbox
);

const helpers = sandbox.journeyHelpers;

function response(overrides = {}) {
  return {
    id: "response-1",
    status: "submitted",
    decision: "can_help",
    indicativePrice: {
      amount: 1850000,
      currency: "AUD"
    },
    ...overrides
  };
}

function connectWorkspace(responses = []) {
  return {
    phase: "connect",
    status: "supplier_outreach",
    nextAction: "await_responses",
    researchResult: { approaches: [] },
    solutionDecision: { decision: "outsource" },
    discoveredSuppliers: [{ id: "supplier-1" }],
    matches: [],
    invitations: [{ status: "opened" }],
    outreachDeliveries: [],
    responses
  };
}

test("keeps the comparison gate blocked at zero responses", () => {
  const workspace = connectWorkspace();

  assert.equal(helpers.canSelectSupplierFromComparison(workspace), false);
  assert.equal(helpers.canReviewSupplierComparison(workspace), false);
  assert.equal(helpers.resolveLegalBuyerView(workspace, "compare"), "outreach");
});

test("allows exactly one credible response through the explicit recovery path", () => {
  const workspace = connectWorkspace([response()]);

  assert.equal(helpers.hasSingleComparableResponse(workspace), true);
  assert.equal(helpers.canSelectSupplierFromComparison(workspace), true);
  assert.equal(helpers.resolveLegalBuyerView(workspace, "compare"), "compare");
});

test("keeps the standard two-response comparison path unchanged", () => {
  const workspace = connectWorkspace([
    response(),
    response({
      id: "response-2",
      decision: "cannot_help",
      indicativePrice: undefined
    })
  ]);

  assert.equal(helpers.hasSingleComparableResponse(workspace), false);
  assert.equal(helpers.canSelectSupplierFromComparison(workspace), true);
  assert.equal(helpers.journeyViewForPhase(workspace, "connect"), "compare");
});

test("permits completed Find and Connect views but rejects illegal lifecycle targets", () => {
  const secured = {
    ...connectWorkspace([response(), response({ id: "response-2" })]),
    phase: "deploy",
    status: "supplier_secured",
    nextAction: "track_delivery",
    engagement: {
      id: "engagement-1",
      status: "supplier_secured",
      supplierResponseId: "response-1",
      hostedCheckoutUrl: "https://sandbox.getpinch.com.au/pay/link-1"
    }
  };

  assert.equal(helpers.workflowJourneyPhase(secured), "deploy");
  assert.equal(helpers.isHistoricalJourneyPhase(secured, "find"), true);
  assert.equal(helpers.isHistoricalJourneyPhase(secured, "connect"), true);
  assert.equal(helpers.resolveLegalBuyerView(secured, "plan"), "plan");
  assert.equal(helpers.resolveLegalBuyerView(secured, "compare"), "compare");
  assert.equal(
    helpers.resolveLegalBuyerView(secured, "candidates"),
    "deployment"
  );
});

test("wires journey buttons, browser history and heading focus", () => {
  assert.match(mainBundle, /data-journey-phase=/);
  assert.match(mainBundle, /aria-current="step"/);
  assert.match(mainBundle, /window\.history\.pushState/);
  assert.match(mainBundle, /window\.addEventListener\("popstate", handleBuyerPopState\)/);
  assert.match(mainBundle, /heading\.tabIndex = -1/);
  assert.match(mainBundle, /heading\.focus\(\{ preventScroll: true \}\)/);
});

test("renders the single-response warning and read-only completed-stage controls", () => {
  assert.match(
    mainBundle,
    /Review the single response \(1 of 2\)/
  );
  assert.match(
    mainBundle,
    /Only one comparable response was received\.[\s\S]*?Standard flow compares at least two\./
  );
  assert.match(mainBundle, /Find decisions are locked/);
  assert.match(mainBundle, /Supplier already selected/);
  assert.match(mainBundle, /Read-only history/);
});
