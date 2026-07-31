import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const mainBundle = await readFile(
  new URL("../public/assets/main.js", import.meta.url),
  "utf8"
);

const approachHelperStart = mainBundle.indexOf(
  "function selectableApproaches"
);
const approachHelperEnd = mainBundle.indexOf(
  "\nfunction resolveSelectedApproachId",
  approachHelperStart
);

assert.notEqual(
  approachHelperStart,
  -1,
  "selectable pathway helper should exist"
);
assert.notEqual(
  approachHelperEnd,
  -1,
  "selectable pathway helper should be bounded"
);

const helperSandbox = {};
vm.runInNewContext(
  `${mainBundle.slice(approachHelperStart, approachHelperEnd)}
this.selectableApproaches = selectableApproaches;`,
  helperSandbox
);

test("presents exactly the three highest-confidence solution pathways", () => {
  const approaches = helperSandbox.selectableApproaches({
    approaches: [
      { id: "fourth", confidence: 0.61 },
      { id: "second", confidence: 0.82 },
      { id: "first", confidence: 0.95 },
      { id: "third", confidence: 0.74 }
    ]
  });
  assert.deepEqual(
    Array.from(approaches, (approach) => approach.id),
    ["first", "second", "third"]
  );
});

test("keeps the canonical report and outreach controls visible", () => {
  assert.match(mainBundle, />\s*Analyse requirement\s*</);
  assert.match(mainBundle, /structureRequirement\(requirementForm, true\)/);
  assert.doesNotMatch(mainBundle, /class="mode-switch"/);
  assert.match(mainBundle, /aria-label="Veltact Need Profile report"/);
  assert.match(mainBundle, /name="solution-pathway"/);
  assert.match(mainBundle, /data-download-report/);
  assert.match(mainBundle, />\s*Download report\s*</);
  assert.match(mainBundle, /data-find-suppliers/);
  assert.match(mainBundle, />\s*Find suppliers\s*</);
  assert.doesNotMatch(mainBundle, /Use this plan internally/);
  assert.match(mainBundle, /data-candidate-id/);
  assert.match(mainBundle, /data-open-outreach/);
  assert.match(mainBundle, />\s*Connect\s*</);
  assert.match(mainBundle, /name="outreach-choice"/);
  assert.match(mainBundle, /type="checkbox"/);
  assert.match(mainBundle, /Select one or more channels/);
  assert.match(mainBundle, />\s*Send\s*</);
  assert.match(mainBundle, /function scrollBuyerWorkspaceToTop\(\)/);
  assert.match(mainBundle, /match\.risks\.slice\(0, 2\)/);
  assert.match(mainBundle, /Site Assessment \/ Scoping Visit/);
});

test("keeps invalid intake disabled with nearby guidance and reports copy outcomes", () => {
  assert.match(
    mainBundle,
    /minlength="\$\{AI_INTAKE_RAW_REQUIREMENT_MIN_LENGTH\}"/
  );
  assert.match(
    mainBundle,
    /maxlength="\$\{AI_INTAKE_RAW_REQUIREMENT_MAX_LENGTH\}"/
  );
  assert.match(mainBundle, /id="factory-context-guidance"/);
  assert.match(
    mainBundle,
    /primaryActionDisabled \? "disabled" : ""/
  );
  assert.match(mainBundle, /button\.textContent = "Copying…"/);
  assert.match(
    mainBundle,
    /Secure supplier link copied using the browser fallback/
  );
  assert.match(
    mainBundle,
    /errorMessage = errorText\(error\)/
  );
});

test("downloads the canonical buyer-scoped PDF without exposing the token", async () => {
  globalThis.window = {
    location: { origin: "https://buyer.veltact.example" }
  };
  const { RapidMatchService } = await import(
    `../public/assets/rapidMatchService.js?report=${Date.now()}`
  );
  const service = new RapidMatchService();
  service.setBuyerAccessToken("need-123", "buyer-token-123");

  globalThis.fetch = async (url, init) => {
    assert.equal(
      url,
      "https://buyer.veltact.example/api/need-profiles/need-123/report.pdf?selectedApproachId=approach-123"
    );
    assert.equal(init.method, "GET");
    assert.equal(
      init.headers.get("x-veltact-buyer-token"),
      "buyer-token-123"
    );
    assert.doesNotMatch(url, /buyer-token-123/);
    return new Response("%PDF-1.7", {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition":
          "attachment; filename=\"Veltact Need Profile.pdf\""
      }
    });
  };

  const report = await service.downloadNeedReport(
    {
      needProfile: { id: "need-123" }
    },
    "approach-123"
  );
  assert.equal(report.fileName, "Veltact Need Profile.pdf");
  assert.equal(report.blob.type, "application/pdf");
});

test("sends only selected supplier leads through the chosen canonical channels", async () => {
  globalThis.window = {
    location: { origin: "https://buyer.veltact.example" }
  };
  const { RapidMatchService } = await import(
    `../public/assets/rapidMatchService.js?outreach=${Date.now()}`
  );
  const service = new RapidMatchService();
  service.setBuyerAccessToken("need-456", "buyer-token-456");
  const now = "2026-07-28T00:00:00.000Z";
  const workspace = {
    phase: "connect",
    status: "supplier_outreach",
    nextAction: "approve_outreach",
    needProfile: {
      id: "need-456",
      companyName: "Buyer Factory",
      title: "Robotic palletiser",
      description: "Integrate a robotic palletising cell.",
      category: "Industrial automation",
      location: "Western Sydney, NSW",
      priority: "planned",
      mustHaves: [],
      niceToHaves: [],
      constraints: [],
      status: "matching",
      createdAt: now,
      updatedAt: now
    },
    intakeEvidence: [],
    discoveredSuppliers: [],
    suppliers: [],
    matches: [],
    invitations: [],
    outreachDeliveries: [],
    responses: []
  };
  const calls = [];

  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    if (init.method === "POST") {
      return Response.json({});
    }
    if (url.endsWith("/responses")) {
      return Response.json({ responses: [] });
    }
    return Response.json({ workspace });
  };

  await service.sendSupplierOutreach(
    workspace,
    ["lead-1", "lead-3"],
    ["email", "sms"]
  );

  assert.deepEqual(JSON.parse(calls[0].init.body), {
    supplierLeadIds: ["lead-1", "lead-3"],
    deliveryChannels: ["email", "sms"]
  });
  assert.equal(
    calls[0].init.headers.get("x-veltact-buyer-token"),
    "buyer-token-456"
  );
});
