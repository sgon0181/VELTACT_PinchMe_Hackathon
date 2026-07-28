import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt,
  timingSafeEqual
} from "node:crypto";
import { promisify } from "node:util";
import {
  AccountRepository,
  DuplicateAccountError,
  type StoredAccount
} from "./accountRepository.js";

const deriveKey = promisify(scrypt);
const PASSWORD_KEY_LENGTH = 64;
const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const DUMMY_SALT = "veltact-invalid-account";
const DUMMY_HASH =
  "uQ3ka5f2bMG8hyLzX1qKUIIFVdNVh8vRjKc5_xO2Lw5RJXqzIgZhVSf0PaPkwRgzhucrJVgBS_mDWhVAcdBqiQ";

export type PublicAccount = {
  id: string;
  email: string;
  createdAt: string;
};

type SessionRecord = {
  accountId: string;
  expiresAt: number;
};

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Email or password is incorrect.");
    this.name = "InvalidCredentialsError";
  }
}

export { DuplicateAccountError };

export class AccountService {
  private readonly sessions = new Map<string, SessionRecord>();

  constructor(
    private readonly repository: AccountRepository,
    private readonly now: () => number = Date.now
  ) {}

  async createAccount(email: string, password: string) {
    const normalizedEmail = normalizeEmail(email);
    const existing = await this.repository.findByEmail(normalizedEmail);
    if (existing) {
      throw new DuplicateAccountError();
    }
    const passwordSalt = randomBytes(16).toString("base64url");
    const passwordHash = await hashPassword(password, passwordSalt);
    const account: StoredAccount = {
      id: randomUUID(),
      email: normalizedEmail,
      passwordSalt,
      passwordHash,
      createdAt: new Date(this.now()).toISOString()
    };
    await this.repository.insert(account);
    return this.issueSession(account);
  }

  async signIn(email: string, password: string) {
    const account = await this.repository.findByEmail(normalizeEmail(email));
    const passwordMatches = await verifyPassword(
      password,
      account?.passwordSalt ?? DUMMY_SALT,
      account?.passwordHash ?? DUMMY_HASH
    );
    if (!account || !passwordMatches) {
      throw new InvalidCredentialsError();
    }
    return this.issueSession(account);
  }

  async currentAccount(sessionToken: string | undefined) {
    if (!sessionToken) {
      return undefined;
    }
    const sessionKey = hashSessionToken(sessionToken);
    const session = this.sessions.get(sessionKey);
    if (!session || session.expiresAt <= this.now()) {
      this.sessions.delete(sessionKey);
      return undefined;
    }
    const account = await this.repository.findById(session.accountId);
    return account ? publicAccount(account) : undefined;
  }

  revokeSession(sessionToken: string | undefined) {
    if (sessionToken) {
      this.sessions.delete(hashSessionToken(sessionToken));
    }
  }

  private issueSession(account: StoredAccount) {
    const sessionToken = randomBytes(32).toString("base64url");
    const expiresAt = this.now() + SESSION_LIFETIME_MS;
    this.sessions.set(hashSessionToken(sessionToken), {
      accountId: account.id,
      expiresAt
    });
    return {
      account: publicAccount(account),
      sessionToken,
      expiresAt: new Date(expiresAt).toISOString()
    };
  }
}

export const sessionLifetimeMs = SESSION_LIFETIME_MS;

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

async function hashPassword(password: string, salt: string) {
  const key = (await deriveKey(password, salt, PASSWORD_KEY_LENGTH)) as Buffer;
  return key.toString("base64url");
}

async function verifyPassword(password: string, salt: string, expectedHash: string) {
  const candidate = Buffer.from(await hashPassword(password, salt), "base64url");
  const expected = Buffer.from(expectedHash, "base64url");
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function publicAccount(account: StoredAccount): PublicAccount {
  return {
    id: account.id,
    email: account.email,
    createdAt: account.createdAt
  };
}
