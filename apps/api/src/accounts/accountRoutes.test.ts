import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "node:test";
import express from "express";
import { AccountRepository } from "./accountRepository.js";
import { createAccountRouter } from "./accountRoutes.js";
import { AccountService } from "./accountService.js";

describe("isolated account access", () => {
  const servers: Server[] = [];
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
          })
      )
    );
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) =>
        rm(directory, { recursive: true, force: true })
      )
    );
  });

  test("creates a durable account and manages an opaque HttpOnly session", async () => {
    const context = await startAccountServer();
    const password = "correct-horse-battery";
    const created = await fetch(`${context.baseUrl}/api/accounts`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "Buyer@Example.com",
        password
      })
    });

    assert.equal(created.status, 201);
    const createdBody = (await created.json()) as {
      account: { id: string; email: string };
    };
    assert.equal(createdBody.account.email, "buyer@example.com");
    assert.ok(createdBody.account.id);

    const setCookie = created.headers.get("set-cookie");
    assert.ok(setCookie);
    assert.match(setCookie, /^veltact_account_session=/);
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Lax/i);
    assert.equal(setCookie.includes(password), false);
    const cookie = setCookie.split(";")[0];

    const current = await fetch(`${context.baseUrl}/api/accounts/session`, {
      headers: { cookie }
    });
    assert.equal(current.status, 200);
    const currentBody = (await current.json()) as {
      account: { email: string };
    };
    assert.equal(currentBody.account.email, "buyer@example.com");

    const persisted = await readFile(context.dataFile, "utf8");
    assert.equal(persisted.includes(password), false);
    assert.match(persisted, /"passwordHash"/);
    assert.match(persisted, /"passwordSalt"/);

    const signedOut = await fetch(`${context.baseUrl}/api/accounts/session`, {
      method: "DELETE",
      headers: { cookie }
    });
    assert.equal(signedOut.status, 204);
    const afterSignOut = await fetch(
      `${context.baseUrl}/api/accounts/session`,
      { headers: { cookie } }
    );
    assert.equal(afterSignOut.status, 401);
  });

  test("rejects weak passwords, duplicate emails and invalid credentials", async () => {
    const context = await startAccountServer();

    const weak = await createAccount(
      context.baseUrl,
      "buyer@example.com",
      "too-short"
    );
    assert.equal(weak.status, 400);

    const created = await createAccount(
      context.baseUrl,
      "buyer@example.com",
      "minimum-twelve-characters"
    );
    assert.equal(created.status, 201);

    const duplicate = await createAccount(
      context.baseUrl,
      "BUYER@example.com",
      "another-secure-password"
    );
    assert.equal(duplicate.status, 409);

    const invalid = await fetch(`${context.baseUrl}/api/accounts/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "unknown@example.com",
        password: "minimum-twelve-characters"
      })
    });
    assert.equal(invalid.status, 401);
    const invalidBody = (await invalid.json()) as { message: string };
    assert.equal(invalidBody.message, "Email or password is incorrect.");
  });

  test("retains account credentials across application restarts without retaining sessions", async () => {
    const directory = await createTemporaryDirectory();
    const dataFile = path.join(directory, "accounts.json");
    const first = await startAccountServer(dataFile);
    const created = await createAccount(
      first.baseUrl,
      "persisted@example.com",
      "persistent-account-password"
    );
    assert.equal(created.status, 201);
    const originalCookie = created.headers.get("set-cookie")?.split(";")[0];
    assert.ok(originalCookie);

    await closeServer(first.server);
    const serverIndex = servers.indexOf(first.server);
    if (serverIndex >= 0) servers.splice(serverIndex, 1);

    const restarted = await startAccountServer(dataFile);
    const oldSession = await fetch(
      `${restarted.baseUrl}/api/accounts/session`,
      { headers: { cookie: originalCookie } }
    );
    assert.equal(oldSession.status, 401);

    const signedIn = await fetch(`${restarted.baseUrl}/api/accounts/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "persisted@example.com",
        password: "persistent-account-password"
      })
    });
    assert.equal(signedIn.status, 200);
    assert.match(signedIn.headers.get("set-cookie") ?? "", /HttpOnly/i);
  });

  async function startAccountServer(existingDataFile?: string) {
    const dataFile =
      existingDataFile ??
      path.join(await createTemporaryDirectory(), "accounts.json");
    const app = express();
    app.use(express.json());
    app.use(
      "/api/accounts",
      createAccountRouter({
        service: new AccountService(new AccountRepository(dataFile))
      })
    );
    const server = createServer(app);
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    return {
      server,
      dataFile,
      baseUrl: `http://127.0.0.1:${address.port}`
    };
  }

  async function createTemporaryDirectory() {
    const directory = await mkdtemp(path.join(tmpdir(), "veltact-account-"));
    temporaryDirectories.push(directory);
    return directory;
  }
});

function createAccount(baseUrl: string, email: string, password: string) {
  return fetch(`${baseUrl}/api/accounts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password })
  });
}

function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
