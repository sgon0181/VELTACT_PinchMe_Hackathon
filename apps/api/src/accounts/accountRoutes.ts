import type { NextFunction, Request, RequestHandler, Response } from "express";
import { Router } from "express";
import { z, ZodError } from "zod";
import {
  AccountRepository,
  defaultAccountDataFile
} from "./accountRepository.js";
import {
  AccountService,
  DuplicateAccountError,
  InvalidCredentialsError,
  sessionLifetimeMs
} from "./accountService.js";

export const accountSessionCookie = "veltact_account_session";

const credentialsSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters.")
    .max(128, "Password must be no more than 128 characters.")
});

type AccountRouterOptions = {
  service: AccountService;
  secureCookies?: boolean;
};

export function createAccountRouter({
  service,
  secureCookies = false
}: AccountRouterOptions) {
  const router = Router();

  router.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
  });

  router.post(
    "/",
    asyncHandler(async (request, response) => {
      const credentials = credentialsSchema.parse(request.body);
      const result = await service.createAccount(
        credentials.email,
        credentials.password
      );
      setSessionCookie(response, result.sessionToken, secureCookies);
      response.status(201).json({
        account: result.account,
        sessionExpiresAt: result.expiresAt
      });
    })
  );

  router.post(
    "/session",
    asyncHandler(async (request, response) => {
      const credentials = credentialsSchema.parse(request.body);
      const result = await service.signIn(credentials.email, credentials.password);
      setSessionCookie(response, result.sessionToken, secureCookies);
      response.json({
        account: result.account,
        sessionExpiresAt: result.expiresAt
      });
    })
  );

  router.get(
    "/session",
    asyncHandler(async (request, response) => {
      const account = await service.currentAccount(readSessionCookie(request));
      if (!account) {
        response.status(401).json({
          status: "error",
          message: "No active account session."
        });
        return;
      }
      response.json({ account });
    })
  );

  router.delete("/session", (request, response) => {
    service.revokeSession(readSessionCookie(request));
    response.clearCookie(accountSessionCookie, {
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookies,
      path: "/"
    });
    response.status(204).end();
  });

  router.use(
    (
      error: unknown,
      _request: Request,
      response: Response,
      next: NextFunction
    ) => {
      if (error instanceof ZodError) {
        response.status(400).json({
          status: "error",
          message: error.issues[0]?.message ?? "Account details are invalid."
        });
        return;
      }
      if (error instanceof DuplicateAccountError) {
        response.status(409).json({
          status: "error",
          message: error.message
        });
        return;
      }
      if (error instanceof InvalidCredentialsError) {
        response.status(401).json({
          status: "error",
          message: error.message
        });
        return;
      }
      next(error);
    }
  );

  return router;
}

export function createDefaultAccountRouter() {
  const repository = new AccountRepository(defaultAccountDataFile());
  return createAccountRouter({
    service: new AccountService(repository),
    secureCookies: process.env.NODE_ENV === "production"
  });
}

function asyncHandler(
  handler: (request: Request, response: Response) => Promise<void>
): RequestHandler {
  return (request, response, next) => {
    void handler(request, response).catch(next);
  };
}

function setSessionCookie(
  response: Response,
  sessionToken: string,
  secureCookies: boolean
) {
  response.cookie(
    accountSessionCookie,
    sessionToken,
    sessionCookieOptions(secureCookies)
  );
}

function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: sessionLifetimeMs
  };
}

function readSessionCookie(request: Request) {
  const cookieHeader = request.header("cookie");
  if (!cookieHeader) {
    return undefined;
  }
  for (const value of cookieHeader.split(";")) {
    const [name, ...parts] = value.trim().split("=");
    if (name === accountSessionCookie) {
      return decodeURIComponent(parts.join("="));
    }
  }
  return undefined;
}
