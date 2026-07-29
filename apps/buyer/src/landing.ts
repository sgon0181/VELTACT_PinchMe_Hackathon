document.documentElement.classList.add("js");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const loader = document.querySelector<HTMLElement>("[data-landing-loader]");

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

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", revealLanding, { once: true });
} else {
  revealLanding();
}

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
