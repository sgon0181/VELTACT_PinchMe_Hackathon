import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, test } from "node:test";

const signIn = await readFile(
  new URL("../public/signin.html", import.meta.url),
  "utf8"
);
const createAccount = await readFile(
  new URL("../public/create-account.html", import.meta.url),
  "utf8"
);
const accountBundle = await readFile(
  new URL("../public/assets/accountAccess.js", import.meta.url),
  "utf8"
);

describe("account entry pages", () => {
  test("keeps the exact public account actions and an unauthenticated demo link", () => {
    for (const page of [signIn, createAccount]) {
      assert.match(page, />Sign in</);
      assert.match(page, />Create account</);
      assert.match(page, /class="try-demo" href="\.\/index\.html\?start=new">Trial Demo</);
      assert.doesNotMatch(page, /v2\.html/);
      assert.match(page, /assets\/accountAccess\.js/);
    }
  });

  test("uses browser password-manager semantics and twelve-character minimums", () => {
    assert.match(signIn, /autocomplete="email"/);
    assert.match(signIn, /autocomplete="current-password"/);
    assert.match(signIn, /minlength="12"/);
    assert.match(createAccount, /autocomplete="new-password"/);
    assert.match(createAccount, /name="confirmPassword"/);
    assert.match(createAccount, /minlength="12"/);
  });

  test("uses only the isolated account boundary and same-origin cookies", () => {
    assert.match(accountBundle, /\/accounts\/session/);
    assert.match(accountBundle, /credentials: "same-origin"/);
    assert.doesNotMatch(accountBundle, /x-veltact-buyer-token/);
    assert.doesNotMatch(accountBundle, /supplier-invitations/);
  });
});
