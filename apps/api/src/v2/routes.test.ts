import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import express from "express";
import { v2Router } from "./routes.js";

test("supplier response validation is conditional and field-specific", async (context) => {
  const testApp = express();
  testApp.use(express.json());
  testApp.use("/api/v2", v2Router);
  const server = createServer(testApp);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  context.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      })
  );
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const endpoint = `http://127.0.0.1:${address.port}/api/v2/supplier-claims/not-a-real-token/response`;

  const invalidPrice = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      decision: "can_help",
      availability: "Next week",
      indicativePriceAud: 0,
      proposedApproach: "Review the scope and deliver in milestones.",
      relevantExperience: "Comparable industrial delivery.",
      assumptions: [],
      conditions: []
    })
  });
  assert.equal(invalidPrice.status, 400);
  const invalidPayload = (await invalidPrice.json()) as {
    message: string;
    issues: Record<string, string[]>;
  };
  assert.equal(
    invalidPayload.message,
    "Enter an indicative price greater than AUD 0."
  );
  assert.deepEqual(invalidPayload.issues.indicativePriceAud, [
    "Enter an indicative price greater than AUD 0."
  ]);

  const decline = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      decision: "cannot_help",
      declineReason: "Outside our current service window."
    })
  });
  assert.equal(decline.status, 404);
  const declinePayload = (await decline.json()) as { message: string };
  assert.equal(declinePayload.message, "Supplier claim not found");
});
