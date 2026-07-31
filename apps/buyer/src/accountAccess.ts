import { apiBaseUrl } from "./apiBase.js";

type AccountResponse = {
  account?: {
    id: string;
    email: string;
    createdAt: string;
  };
  message?: string;
};

const apiRoot = apiBaseUrl();
const form = document.querySelector<HTMLFormElement>("#account-form");
const formPanel = document.querySelector<HTMLElement>("#account-form-panel");
const sessionPanel = document.querySelector<HTMLElement>("#account-session");
const sessionEmail = document.querySelector<HTMLElement>("#session-email");
const status = document.querySelector<HTMLElement>("#account-status");
const submitButton = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
const signOutButton = document.querySelector<HTMLButtonElement>("#sign-out-button");
const passwordVisibility = document.querySelector<HTMLInputElement>(
  "#show-passwords"
);
let accountFormInteracted = false;

void restoreSession();

form?.addEventListener("submit", (event) => {
  event.preventDefault();
  accountFormInteracted = true;
  void submitAccountForm();
});
form?.addEventListener("focusin", markAccountFormInteracted);
form?.addEventListener("input", markAccountFormInteracted);
form?.addEventListener("pointerdown", markAccountFormInteracted);

signOutButton?.addEventListener("click", () => {
  void signOut();
});

passwordVisibility?.addEventListener("change", () => {
  document
    .querySelectorAll<HTMLInputElement>('input[data-password-field="true"]')
    .forEach((input) => {
      input.type = passwordVisibility.checked ? "text" : "password";
    });
});

async function submitAccountForm() {
  if (!form || !submitButton) return;
  const page = document.body.dataset.accountPage;
  const formData = new FormData(form);
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  if (page === "create") {
    const confirmation = String(formData.get("confirmPassword") ?? "");
    if (password !== confirmation) {
      showStatus("Passwords do not match.", "error");
      const confirmationField = form.elements.namedItem("confirmPassword");
      if (confirmationField instanceof HTMLElement) {
        confirmationField.focus();
      }
      return;
    }
  }

  setBusy(true);
  showStatus(page === "create" ? "Creating account..." : "Signing in...", "neutral");
  try {
    const response = await accountRequest<AccountResponse>(
      page === "create" ? "/accounts" : "/accounts/session",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password })
      }
    );
    if (!response.account) {
      throw new Error("Account session was not returned.");
    }
    form.reset();
    showSession(response.account.email);
    showStatus(
      page === "create"
        ? "Account created and signed in."
        : "Signed in successfully.",
      "success"
    );
  } catch (error) {
    showStatus(
      error instanceof Error ? error.message : "Account access is unavailable.",
      "error"
    );
  } finally {
    setBusy(false);
  }
}

async function restoreSession() {
  try {
    const response = await accountRequest<AccountResponse>("/accounts/session");
    if (
      response.account &&
      !accountFormInteracted &&
      !accountFormHasFocus()
    ) {
      showSession(response.account.email);
    }
  } catch (error) {
    if (!(error instanceof AccountRequestError) || error.status !== 401) {
      showStatus("Account service is temporarily unavailable.", "error");
    }
  }
}

async function signOut() {
  if (!signOutButton) return;
  signOutButton.disabled = true;
  try {
    await accountRequest("/accounts/session", { method: "DELETE" });
    showAccountForm();
    showStatus("Signed out.", "success");
  } catch (error) {
    showStatus(
      error instanceof Error ? error.message : "Unable to sign out.",
      "error"
    );
  } finally {
    signOutButton.disabled = false;
  }
}

function showSession(email: string) {
  if (sessionEmail) {
    sessionEmail.textContent = email;
  }
  formPanel?.setAttribute("hidden", "");
  sessionPanel?.removeAttribute("hidden");
  focusPanelHeading(sessionPanel, "#account-session-title");
}

function showAccountForm() {
  sessionPanel?.setAttribute("hidden", "");
  formPanel?.removeAttribute("hidden");
  focusPanelHeading(formPanel, "#account-form-title");
}

function markAccountFormInteracted() {
  accountFormInteracted = true;
}

function accountFormHasFocus() {
  return Boolean(form && form.contains(document.activeElement));
}

function focusPanelHeading(
  panel: HTMLElement | null,
  selector: string
) {
  const heading = panel?.querySelector<HTMLElement>(selector);
  heading?.focus();
}

function setBusy(busy: boolean) {
  if (!submitButton || !form) return;
  submitButton.disabled = busy;
  form.setAttribute("aria-busy", String(busy));
}

function showStatus(
  message: string,
  kind: "neutral" | "success" | "error"
) {
  if (!status) return;
  status.textContent = message;
  status.dataset.kind = kind;
}

async function accountRequest<T = undefined>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${apiRoot}${path}`, {
    ...init,
    credentials: "same-origin",
    headers: {
      Accept: "application/json",
      ...init.headers
    }
  });
  if (response.status === 204) {
    return undefined as T;
  }
  const payload = (await response.json()) as T & { message?: string };
  if (!response.ok) {
    throw new AccountRequestError(
      response.status,
      payload.message ?? "Account request failed."
    );
  }
  return payload;
}

class AccountRequestError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "AccountRequestError";
  }
}
