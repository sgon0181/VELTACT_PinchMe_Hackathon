import { demoControlsEnabled } from "./apiBase.js";

document.documentElement.classList.add("js");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const revealElements = document.querySelectorAll<HTMLElement>("[data-reveal]");

if (reducedMotion || !("IntersectionObserver" in window)) {
  revealElements.forEach((element) => element.classList.add("is-visible"));
} else {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
  );

  revealElements.forEach((element) => observer.observe(element));
}

const year = document.querySelector<HTMLElement>("#year");
if (year) {
  year.textContent = String(new Date().getFullYear());
}

type DemoScenario = "plc" | "robotics";
type DemoResetResponse = {
  buyerUrl?: string;
  supplierPaths?: Array<{
    supplierName?: string;
    responseUrl?: string;
  }>;
  scenario?: DemoScenario;
  message?: string;
};

const guidedDemo = document.querySelector<HTMLElement>("#guided-demo");
const guidedDemoLink = document.querySelector<HTMLElement>("#guided-demo-link");
const demoStatus = document.querySelector<HTMLElement>("#demo-launch-status");
const demoRoleLinks = document.querySelector<HTMLElement>("#demo-role-links");
const demoBuyerLink = document.querySelector<HTMLAnchorElement>("#demo-buyer-link");
const demoSupplierLinks = [
  document.querySelector<HTMLAnchorElement>("#demo-supplier-one-link"),
  document.querySelector<HTMLAnchorElement>("#demo-supplier-two-link")
];
const demoScenarioButtons = Array.from(
  document.querySelectorAll<HTMLButtonElement>("[data-demo-scenario]")
);

void configureGuidedDemo();

async function configureGuidedDemo() {
  if (
    !guidedDemo ||
    !guidedDemoLink ||
    !demoStatus ||
    !demoRoleLinks ||
    !demoBuyerLink ||
    demoSupplierLinks.some((link) => !link) ||
    demoScenarioButtons.length === 0
  ) {
    return;
  }

  if (!(await demoControlsEnabled())) return;

  guidedDemo.hidden = false;
  guidedDemoLink.hidden = false;
  demoScenarioButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const scenario = button.dataset.demoScenario;
      if (scenario === "plc" || scenario === "robotics") {
        void launchDemoScenario(scenario);
      }
    });
  });
}

async function launchDemoScenario(scenario: DemoScenario) {
  if (
    !demoStatus ||
    !demoRoleLinks ||
    !demoBuyerLink ||
    demoSupplierLinks.some((link) => !link)
  ) {
    return;
  }

  setDemoBusy(true);
  demoRoleLinks.hidden = true;
  demoStatus.className = "demo-launch-status";
  demoStatus.textContent = `Preparing the ${scenario === "plc" ? "urgent PLC recovery" : "planned robotic integration"} workflow...`;

  try {
    const response = await fetch("/api/demo/reset", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({ scenario })
    });
    const payload = (await response.json()) as DemoResetResponse;
    if (!response.ok) {
      throw new Error(payload.message ?? `Demo reset failed (${response.status})`);
    }

    const buyerUrl = validDemoUrl(payload.buyerUrl);
    const suppliers = (payload.supplierPaths ?? [])
      .slice(0, demoSupplierLinks.length)
      .map((path) => ({
        name: path.supplierName,
        url: validDemoUrl(path.responseUrl)
      }))
      .filter(
        (supplier): supplier is { name: string | undefined; url: string } =>
          Boolean(supplier.url)
      );
    if (!buyerUrl || suppliers.length !== demoSupplierLinks.length) {
      throw new Error("The demo reset did not return the buyer and supplier role links.");
    }

    demoBuyerLink.href = buyerUrl;
    demoSupplierLinks.forEach((link, index) => {
      const supplier = suppliers[index];
      if (!link || !supplier) return;
      link.href = supplier.url;
      link.textContent = supplier.name
        ? `Open ${supplier.name}`
        : `Open supplier ${index === 0 ? "A" : "B"} invitation`;
    });
    demoRoleLinks.hidden = false;
    demoStatus.className = "demo-launch-status is-ready";
    demoStatus.textContent =
      `${scenario === "plc" ? "Urgent PLC recovery" : "Planned robotic integration"} is ready. ` +
      "Open the buyer workspace first, then use both private supplier invitations when Connect reaches the response step.";
    demoBuyerLink.focus();
  } catch (error) {
    demoStatus.className = "demo-launch-status is-error";
    demoStatus.textContent =
      error instanceof Error ? error.message : "Unable to prepare the guided demo.";
  } finally {
    setDemoBusy(false);
  }
}

function setDemoBusy(busy: boolean) {
  demoScenarioButtons.forEach((button) => {
    button.disabled = busy;
  });
}

function validDemoUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value, window.location.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}
