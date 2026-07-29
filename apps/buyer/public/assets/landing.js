"use strict";
document.documentElement.classList.add("js");
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const loader = document.querySelector("[data-landing-loader]");
const loaderDwellMs = reducedMotion ? 0 : 520;
function revealLanding() {
    document.body.classList.add("landing-ready");
    loader?.setAttribute("aria-hidden", "true");
    if (reducedMotion) {
        loader?.remove();
        return;
    }
    loader?.addEventListener("transitionend", () => loader.remove(), { once: true });
    window.setTimeout(() => loader?.remove(), 500);
}
function scheduleLandingReveal() {
    if (loaderDwellMs === 0) {
        revealLanding();
        return;
    }
    window.setTimeout(revealLanding, loaderDwellMs);
}
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", scheduleLandingReveal, { once: true });
}
else {
    scheduleLandingReveal();
}
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
