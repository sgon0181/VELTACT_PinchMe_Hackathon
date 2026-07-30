document.documentElement.classList.add("js");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const loader = document.querySelector<HTMLElement>("[data-landing-loader]");
const story = document.querySelector<HTMLElement>("[data-story]");
const loaderDwellMs = reducedMotion ? 0 : 620;

function revealLanding() {
  document.body.classList.add("landing-ready");
  document.body.classList.remove("story-locked");
  loader?.setAttribute("aria-hidden", "true");

  if (reducedMotion) {
    loader?.remove();
    return;
  }

  loader?.addEventListener("transitionend", () => loader.remove(), { once: true });
  window.setTimeout(() => loader?.remove(), 500);
}

function supportsWebGL() {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

async function prepareStory() {
  if (!story || reducedMotion || !supportsWebGL()) {
    if (story) {
      story.dataset.storyState = "fallback";
    }
    return;
  }

  try {
    const { createLumenStory } = await import("./landingScene.js");
    const controller = createLumenStory(story);
    window.addEventListener("pagehide", () => controller.destroy(), { once: true });
  } catch (error) {
    console.error("Unable to initialise the landing animation", error);
    story.dataset.storyState = "fallback";
  }
}

document.body.classList.add("story-locked");

void prepareStory().finally(() => {
  if (loaderDwellMs === 0) {
    revealLanding();
    return;
  }

  window.setTimeout(revealLanding, loaderDwellMs);
});
