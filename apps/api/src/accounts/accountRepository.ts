import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const storedAccountSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  passwordSalt: z.string().min(1),
  passwordHash: z.string().min(1),
  createdAt: z.string().datetime()
});

const accountSnapshotSchema = z.object({
  version: z.literal(1),
  accounts: z.array(storedAccountSchema)
});

export type StoredAccount = z.infer<typeof storedAccountSchema>;

export class DuplicateAccountError extends Error {
  constructor() {
    super("An account already exists for this email.");
    this.name = "DuplicateAccountError";
  }
}

export class AccountRepository {
  private accounts: StoredAccount[];
  private mutationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly filePath?: string) {
    this.accounts = loadAccounts(filePath);
  }

  async findByEmail(email: string) {
    await this.mutationQueue;
    const account = this.accounts.find((item) => item.email === email);
    return account ? structuredClone(account) : undefined;
  }

  async findById(accountId: string) {
    await this.mutationQueue;
    const account = this.accounts.find((item) => item.id === accountId);
    return account ? structuredClone(account) : undefined;
  }

  async insert(account: StoredAccount) {
    const operation = this.mutationQueue.then(() => {
      if (this.accounts.some((item) => item.email === account.email)) {
        throw new DuplicateAccountError();
      }
      this.accounts.push(structuredClone(account));
      saveAccounts(this.filePath, this.accounts);
    });
    this.mutationQueue = operation.catch(() => undefined);
    await operation;
  }
}

export function defaultAccountDataFile() {
  return path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../.data/accounts.json"
  );
}

function loadAccounts(filePath: string | undefined): StoredAccount[] {
  if (!filePath || !existsSync(filePath)) {
    return [];
  }
  const parsed = accountSnapshotSchema.safeParse(
    JSON.parse(readFileSync(filePath, "utf8"))
  );
  if (!parsed.success) {
    throw new Error(`Account data file is not a valid version 1 snapshot: ${filePath}`);
  }
  return parsed.data.accounts;
}

function saveAccounts(filePath: string | undefined, accounts: StoredAccount[]) {
  if (!filePath) {
    return;
  }
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  writeFileSync(
    temporaryPath,
    `${JSON.stringify({ version: 1, accounts }, null, 2)}\n`,
    {
      encoding: "utf8",
      mode: 0o600
    }
  );
  renameSync(temporaryPath, filePath);
}
