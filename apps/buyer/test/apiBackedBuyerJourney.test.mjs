import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

test(
  "runs the fresh buyer report and selected-channel journey against the real API",
  { timeout: 30_000 },
  async (context) => {
    const port = await availablePort();
    const origin = `http://127.0.0.1:${port}`;
    const api = startApi(origin, port);
    context.after(() => stopApi(api));
    await waitForApi(api, origin);

    globalThis.window = {
      API_BASE_URL: `${origin}/api`,
      FRONTEND_BASE_URL: origin,
      location: { origin },
      setTimeout: globalThis.setTimeout.bind(globalThis),
      clearTimeout: globalThis.clearTimeout.bind(globalThis)
    };

    const cacheKey = `${Date.now()}-${port}`;
    const { BackendAiIntakeService } = await import(
      `../public/assets/aiIntakeService.js?journey=${cacheKey}`
    );
    const { RapidMatchService } = await import(
      `../public/assets/rapidMatchService.js?journey=${cacheKey}`
    );

    const rawRequirement =
      "Western Sydney food factory needs an ABB mixed-carton robotic " +
      "palletising cell integrated with the dispatch conveyor and machine " +
      "vision. Include safety guarding, operator training and a staged install " +
      "within 8 weeks. Budget is AUD 180,000. Technical fit matters.";
    const intake = new BackendAiIntakeService();
    const structured = await intake.structureRequirement({ rawRequirement });

    assert.equal(intake.sourceMode(), "fixture");
    assert.match(structured.generatedProfile.title, /palletis/i);
    assert.equal(
      structured.generatedProfile.location,
      "Western Sydney, NSW"
    );
    assert.ok(structured.generatedProfile.requiredCapabilities.length > 0);

    const generated = structured.generatedProfile;
    const service = new RapidMatchService();
    const created = await service.createNeedProfile(
      {
        companyName: "Fresh Foods Manufacturing",
        contactName: "Avery Buyer",
        contactEmail: "avery.buyer@example.com",
        title: generated.title,
        description: generated.problemSummary,
        category: generated.category,
        equipmentOrTechnology: generated.equipmentOrTechnology,
        requiredCapabilities: generated.requiredCapabilities,
        location: generated.location ?? "",
        requiredBy: generated.urgency ?? "Within 8 weeks",
        budgetRange: generated.budgetRange ?? "Up to AUD 180,000",
        budgetAmount: 180_000,
        constraints: generated.certificationsOrConstraints
      },
      generated.buyerPriority ?? "technical_fit",
      [
        {
          kind: "written",
          name: "Factory requirement",
          source: "buyer",
          status: "processed"
        }
      ]
    );

    assert.ok(created.buyerAccessToken);
    assert.ok(created.workspace.needProfile?.id);
    assert.equal(
      created.workspace.needProfile?.requiredBy,
      generated.urgency ?? "Within 8 weeks",
      "the API should retain the buyer-reviewed timing phrase"
    );
    await assert.rejects(
      service.downloadNeedReport(
        created.workspace,
        "pathway-before-research"
      ),
      (error) => {
        assert.equal(error.status, 409);
        assert.match(error.message, /research must be completed/i);
        return true;
      }
    );

    const researched = await service.researchRequirement(created.workspace);
    assert.equal(researched.researchResult?.approaches.length, 3);
    const selectedApproach = researched.researchResult?.approaches[1];
    assert.ok(selectedApproach);

    const report = await service.downloadNeedReport(
      researched,
      selectedApproach.id
    );
    assert.equal(report.blob.type, "application/pdf");
    assert.ok(report.blob.size > 1_000);
    const reportText = Buffer.from(await report.blob.arrayBuffer()).toString(
      "latin1"
    );
    assert.match(reportText, /VELTACT NEED AND SOLUTION REPORT/);
    assert.match(reportText, /Execution decision: Not recorded/);

    const afterReport = await service.refreshWorkspace(researched);
    assert.equal(
      afterReport.solutionDecision,
      undefined,
      "downloading the selected report must not decide to outsource"
    );

    const outsourced = await service.recordSolutionDecision(
      afterReport,
      "outsource",
      selectedApproach.id
    );
    const discovered = await service.discoverSuppliers(outsourced);
    assert.equal(discovered.solutionDecision?.decision, "outsource");
    assert.deepEqual(discovered.solutionDecision?.selectedApproachIds, [
      selectedApproach.id
    ]);
    assert.equal(discovered.discoveredSuppliers.length, 3);

    const selectedLead = discovered.discoveredSuppliers[1];
    assert.ok(selectedLead);
    const contacted = await service.sendSupplierOutreach(
      discovered,
      [selectedLead.id],
      ["sms"]
    );
    assert.deepEqual(
      contacted.invitations.map((invitation) => invitation.supplierId),
      [selectedLead.id]
    );

    const invitation = contacted.invitations[0];
    assert.ok(invitation);
    const deliveries = contacted.outreachDeliveries.filter(
      (delivery) => delivery.invitationId === invitation.id
    );
    const sms = deliveries.find((delivery) => delivery.channel === "sms");
    const email = deliveries.find((delivery) => delivery.channel === "email");
    assert.match(sms?.errorMessage ?? "", /SMS provider is not configured/i);
    assert.equal(sms?.deliveryStatus, "not_sent");
    assert.equal(email?.deliveryStatus, "not_sent");
    assert.equal(email?.errorMessage, undefined);
  }
);

function startApi(origin, port) {
  return spawn(
    process.execPath,
    ["--import", "tsx", "apps/api/src/server.ts"],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        NODE_ENV: "test",
        PORT: String(port),
        WEB_ORIGIN: origin,
        PUBLIC_BASE_URL: origin,
        API_PUBLIC_URL: origin,
        BUYER_CAPABILITY_AUTH_REQUIRED: "true",
        PAYMENT_PROVIDER: "local_demo",
        EMAIL_PROVIDER: "local_demo",
        SMS_PROVIDER: "none",
        SUPPLIER_OUTREACH_EMAIL_TO: "supplier@example.com",
        SUPPLIER_OUTREACH_SMS_TO: "+61411111111",
        VELTACT_RESEARCH_PROVIDER: "fixture",
        MARKETPLACE_DATA_FILE: "",
        VELTACT_V2_DATA_FILE: "",
        ACCOUNT_DATA_FILE: ""
      },
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
}

async function waitForApi(api, origin) {
  let output = "";
  api.stdout.on("data", (chunk) => {
    output += chunk;
  });
  api.stderr.on("data", (chunk) => {
    output += chunk;
  });

  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (api.exitCode !== null) {
      throw new Error(`Test API exited before startup.\n${output}`);
    }
    try {
      const response = await fetch(`${origin}/api/health`, {
        signal: AbortSignal.timeout(500)
      });
      if (response.ok) return;
    } catch {
      // The child process is still starting.
    }
    await delay(50);
  }
  throw new Error(`Test API did not become ready.\n${output}`);
}

async function stopApi(api) {
  if (api.exitCode !== null || api.signalCode !== null) return;
  api.kill("SIGTERM");
  const exited = once(api, "exit");
  await Promise.race([
    exited,
    delay(2_000).then(() => {
      if (api.exitCode === null) api.kill("SIGKILL");
    })
  ]);
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
