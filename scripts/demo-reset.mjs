const baseUrl = (process.env.VELTACT_BASE_URL ?? "http://localhost:4000").replace(
  /\/$/,
  ""
);
const scenario = process.argv.includes("--robotics") ? "robotics" : "plc";

try {
  const response = await fetch(`${baseUrl}/api/v2/demo/reset`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      seeded: true,
      scenario
    })
  });
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message ?? `Reset failed (${response.status})`);
  }

  console.log("Veltact 2.0 demo reset complete");
  console.log(`Scenario: ${payload.scenario}`);
  console.log(`Buyer: ${payload.buyerUrl}`);
  console.log(`Supplier claim: ${payload.supplierClaimUrl}`);
  console.log(
    "The buyer URL contains a demo capability token. Do not publish it outside the controlled demo."
  );
} catch (error) {
  console.error(
    `Unable to reset ${baseUrl}. Start the Veltact API first with npm run dev.`
  );
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
