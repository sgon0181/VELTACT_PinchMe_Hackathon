export const WORKSPACE_THEME_STORAGE_KEY = "veltact:workspace-theme:v1";
export const DEFAULT_WORKSPACE_THEME = "light" as const;

export type WorkspaceTheme = "light" | "dark";

const WORKSPACE_GLOW_SURFACE_SELECTOR = [
  "[data-v5-glow]",
  ".v5-ambient-surface",
  ".v5-workspace-header",
  ".product-header",
  ".brand-header",
  ".claim-header",
  ".topbar",
  ".account-header",
  ".intake-form",
  ".need-profile",
  ".recommendation-panel",
  ".candidate-card",
  ".solution-option",
  ".match-card",
  ".response-card",
  ".outreach-mode",
  ".outreach-item",
  ".payment-panel",
  ".payment-return-card",
  ".deployment-summary",
  ".milestone-funding-panel",
  ".speed-receipt",
  ".registry-panel",
  ".summary",
  ".response-form",
  ".receipt",
  ".state-panel",
  ".claim-panel",
  ".account-context",
  ".account-form-panel",
  ".account-session"
].join(",");

type ThemeStorage = Pick<Storage, "getItem" | "setItem">;
type ThemeRoot = Pick<HTMLElement, "dataset" | "style">;

export function isWorkspaceTheme(value: unknown): value is WorkspaceTheme {
  return value === "light" || value === "dark";
}

function browserStorage(): ThemeStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readStoredWorkspaceTheme(
  storage: ThemeStorage | null = browserStorage()
): WorkspaceTheme {
  try {
    const storedTheme = storage?.getItem(WORKSPACE_THEME_STORAGE_KEY);
    return isWorkspaceTheme(storedTheme)
      ? storedTheme
      : DEFAULT_WORKSPACE_THEME;
  } catch {
    return DEFAULT_WORKSPACE_THEME;
  }
}

export function storeWorkspaceTheme(
  theme: WorkspaceTheme,
  storage: ThemeStorage | null = browserStorage()
): boolean {
  try {
    storage?.setItem(WORKSPACE_THEME_STORAGE_KEY, theme);
    return storage !== null;
  } catch {
    return false;
  }
}

export function applyWorkspaceTheme(
  theme: unknown,
  root: ThemeRoot = document.documentElement
): WorkspaceTheme {
  const validatedTheme = isWorkspaceTheme(theme)
    ? theme
    : DEFAULT_WORKSPACE_THEME;

  root.dataset.workspaceTheme = validatedTheme;
  root.style.colorScheme = validatedTheme;
  return validatedTheme;
}

function updateToggleCopy(
  button: HTMLButtonElement,
  currentTheme: WorkspaceTheme
): void {
  const nextTheme: WorkspaceTheme =
    currentTheme === "light" ? "dark" : "light";
  const label = button.querySelector<HTMLElement>(
    ".workspace-theme-toggle__label"
  );

  if (label) {
    label.textContent = nextTheme === "dark" ? "Dark" : "Light";
  }

  button.setAttribute("aria-label", `Switch to ${nextTheme} theme`);
  button.setAttribute("aria-pressed", String(currentTheme === "dark"));
  button.title = `Switch to ${nextTheme} theme`;
}

export function mountWorkspaceThemeToggle(): HTMLButtonElement {
  const existing = document.querySelector<HTMLButtonElement>(
    "[data-workspace-theme-toggle]"
  );
  const currentTheme = applyWorkspaceTheme(readStoredWorkspaceTheme());

  if (existing) {
    updateToggleCopy(existing, currentTheme);
    return existing;
  }

  const button = document.createElement("button");
  const label = document.createElement("span");

  button.type = "button";
  button.className = "workspace-theme-toggle";
  button.dataset.workspaceThemeToggle = "true";
  label.className = "workspace-theme-toggle__label";
  label.setAttribute("aria-hidden", "true");
  button.append(label);
  updateToggleCopy(button, currentTheme);

  button.addEventListener("click", () => {
    const activeTheme = isWorkspaceTheme(
      document.documentElement.dataset.workspaceTheme
    )
      ? document.documentElement.dataset.workspaceTheme
      : DEFAULT_WORKSPACE_THEME;
    const nextTheme: WorkspaceTheme =
      activeTheme === "light" ? "dark" : "light";

    applyWorkspaceTheme(nextTheme);
    storeWorkspaceTheme(nextTheme);
    updateToggleCopy(button, nextTheme);
  });

  // This control intentionally lives outside every page's live render root.
  document.body.append(button);
  return button;
}

function initialiseWorkspaceTheme(): void {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountWorkspaceThemeToggle, {
      once: true
    });
  } else {
    mountWorkspaceThemeToggle();
  }

  window.addEventListener("storage", (event) => {
    if (
      event.key !== WORKSPACE_THEME_STORAGE_KEY &&
      event.key !== null
    ) {
      return;
    }

    const nextTheme = isWorkspaceTheme(event.newValue)
      ? event.newValue
      : DEFAULT_WORKSPACE_THEME;
    applyWorkspaceTheme(nextTheme);

    const button = document.querySelector<HTMLButtonElement>(
      "[data-workspace-theme-toggle]"
    );
    if (button) {
      updateToggleCopy(button, nextTheme);
    }
  });
}

function initialisePointerGlow(): void {
  if (typeof window.matchMedia !== "function") {
    return;
  }

  const finePointer = window.matchMedia("(pointer: fine)");
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)"
  );
  if (!finePointer.matches || reducedMotion.matches) {
    return;
  }

  document.addEventListener(
    "pointermove",
    (event) => {
      if (!finePointer.matches || reducedMotion.matches) {
        return;
      }

      const target =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>(WORKSPACE_GLOW_SURFACE_SELECTOR)
          : null;
      if (!target) {
        return;
      }

      const bounds = target.getBoundingClientRect();
      target.style.setProperty("--mx", `${event.clientX - bounds.left}px`);
      target.style.setProperty("--my", `${event.clientY - bounds.top}px`);
    },
    { passive: true }
  );
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  initialiseWorkspaceTheme();
  initialisePointerGlow();
}
