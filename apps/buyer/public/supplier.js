const API_BASE = window.API_BASE_URL || "http://localhost:4000/api";

const token = new URLSearchParams(window.location.search).get("token") || location.pathname.split("/").pop();
const form = document.querySelector("#response-form");
const statusEl = document.querySelector("#form-status");

if (!token || token === "supplier.html") {
  setStatus("Missing invitation token.");
  form.hidden = true;
} else {
  loadOpportunity(token);
  form.addEventListener("submit", (event) => submitResponse(event, token));
}

async function loadOpportunity(invitationToken) {
  try {
    const response = await fetch(`${API_BASE}/supplier-invitations/${encodeURIComponent(invitationToken)}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message || "Supplier invitation not found.");
    }

    renderOpportunity(payload.need, payload.invitation);
  } catch (error) {
    setStatus(error instanceof Error ? error.message : "Unable to load opportunity.");
    form.hidden = true;
  }
}

function renderOpportunity(need, invitation) {
  document.title = `${invitation.supplierName} opportunity`;
  text("#need-title", need.profile.title);
  text("#need-location", need.profile.location);
  text("#need-urgency", need.profile.urgencyDays ? `${need.profile.urgencyDays} days` : "Not specified");
  text("#need-budget", need.profile.budgetAud ? formatMoney(need.profile.budgetAud) : "Not specified");
  text("#need-description", need.profile.description);

  const capabilities = document.querySelector("#capabilities");
  capabilities.replaceChildren(
    ...(need.profile.requiredCapabilities || []).map((capability) => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = capability;
      return chip;
    })
  );
}

async function submitResponse(event, invitationToken) {
  event.preventDefault();
  const submitButton = form.querySelector("button");
  submitButton.disabled = true;
  setStatus("Submitting...");

  const formData = new FormData(form);
  const body = {
    canHelp: formData.get("canHelp") === "true",
    earliestAvailability: String(formData.get("earliestAvailability") || ""),
    indicativePriceAud: Number(formData.get("indicativePriceAud") || 0),
    relevantExperience: String(formData.get("relevantExperience") || ""),
    conditions: String(formData.get("conditions") || "")
  };

  try {
    const response = await fetch(`${API_BASE}/supplier-invitations/${encodeURIComponent(invitationToken)}/responses`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message || "Response was not accepted.");
    }
    setStatus("Response submitted. The buyer dashboard has been updated.");
    form.reset();
  } catch (error) {
    submitButton.disabled = false;
    setStatus(error instanceof Error ? error.message : "Unable to submit response.");
  }
}

function text(selector, value) {
  document.querySelector(selector).textContent = value || "-";
}

function setStatus(message) {
  statusEl.textContent = message;
}

function formatMoney(amount) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0
  }).format(amount);
}
