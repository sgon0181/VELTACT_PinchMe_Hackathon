"use strict";
document.documentElement.classList.add("js");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const revealElements = document.querySelectorAll("[data-reveal]");
if (reducedMotion || !("IntersectionObserver" in window)) {
    revealElements.forEach((element) => element.classList.add("is-visible"));
}
else {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) {
                return;
            }
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
        });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    revealElements.forEach((element) => observer.observe(element));
}
const year = document.querySelector("#year");
if (year) {
    year.textContent = String(new Date().getFullYear());
}
const guidedDemo = document.querySelector("#guided-demo");
const guidedDemoLink = document.querySelector("#guided-demo-link");
const demoStatus = document.querySelector("#demo-launch-status");
const demoRoleLinks = document.querySelector("#demo-role-links");
const demoBuyerLink = document.querySelector("#demo-buyer-link");
const demoSupplierLink = document.querySelector("#demo-supplier-link");
const demoScenarioButtons = Array.from(document.querySelectorAll("[data-demo-scenario]"));
void configureGuidedDemo();
async function configureGuidedDemo() {
    if (!guidedDemo ||
        !guidedDemoLink ||
        !demoStatus ||
        !demoRoleLinks ||
        !demoBuyerLink ||
        !demoSupplierLink ||
        demoScenarioButtons.length === 0) {
        return;
    }
    try {
        const response = await fetch("/api/health", {
            headers: { Accept: "application/json" }
        });
        const health = (await response.json());
        if (!response.ok || health.environment === "production") {
            return;
        }
    }
    catch {
        return;
    }
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
async function launchDemoScenario(scenario) {
    if (!demoStatus || !demoRoleLinks || !demoBuyerLink || !demoSupplierLink) {
        return;
    }
    setDemoBusy(true);
    demoRoleLinks.hidden = true;
    demoStatus.className = "demo-launch-status";
    demoStatus.textContent = `Preparing the ${scenario === "plc" ? "urgent PLC recovery" : "planned robotic integration"} workflow...`;
    try {
        const response = await fetch("/api/v2/demo/reset", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json"
            },
            body: JSON.stringify({ seeded: true, scenario })
        });
        const payload = (await response.json());
        if (!response.ok) {
            throw new Error(payload.message ?? `Demo reset failed (${response.status})`);
        }
        const buyerUrl = validDemoUrl(payload.buyerUrl);
        const supplierUrl = validDemoUrl(payload.supplierClaimUrl);
        if (!buyerUrl || !supplierUrl) {
            throw new Error("The demo reset did not return both role links.");
        }
        demoBuyerLink.href = buyerUrl;
        demoSupplierLink.href = supplierUrl;
        demoRoleLinks.hidden = false;
        demoStatus.className = "demo-launch-status is-ready";
        demoStatus.textContent =
            `${scenario === "plc" ? "Urgent PLC recovery" : "Planned robotic integration"} is ready. ` +
                "Open the buyer workspace first, then use the supplier invitation when Connect reaches the claim step.";
        demoBuyerLink.focus();
    }
    catch (error) {
        demoStatus.className = "demo-launch-status is-error";
        demoStatus.textContent =
            error instanceof Error ? error.message : "Unable to prepare the guided demo.";
    }
    finally {
        setDemoBusy(false);
    }
}
function setDemoBusy(busy) {
    demoScenarioButtons.forEach((button) => {
        button.disabled = busy;
    });
}
function validDemoUrl(value) {
    if (!value)
        return undefined;
    try {
        const url = new URL(value, window.location.origin);
        return ["http:", "https:"].includes(url.protocol) ? url.toString() : undefined;
    }
    catch {
        return undefined;
    }
}
