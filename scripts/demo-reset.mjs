const baseUrl = (process.env.VELTACT_BASE_URL ?? "http://localhost:4000").replace(
  /\/$/,
  ""
);
const scenario = process.argv.includes("--robotics") ? "robotics" : "plc";

try {
  const response = await fetch(`${baseUrl}/api/demo/reset`, {
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

  console.log("Veltact canonical demo reset complete");
  console.log(`Scenario: ${payload.scenario}`);
  console.log(`Buyer: ${payload.buyerUrl}`);
  for (const [index, supplier] of (payload.supplierPaths ?? []).entries()) {
    console.log(
      `Supplier ${index + 1} (${supplier.supplierName}): ${supplier.responseUrl}`
    );
  }
  console.log(
    "The buyer and supplier URLs contain scoped capability tokens. Do not publish them outside the controlled demo."
  );
} catch (error) {
  console.error(
    `Unable to reset ${baseUrl}. Start the Veltact API first with npm run dev.`
  );
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
