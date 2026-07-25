import type { RequestHandler } from "express";
import { env } from "./env.js";

type RateLimitOptions = {
  limit: number;
  windowMs?: number;
  scope: string;
};

type Counter = {
  count: number;
  resetsAt: number;
};

export function createRateLimiter({
  limit,
  windowMs = 60_000,
  scope
}: RateLimitOptions): RequestHandler {
  const counters = new Map<string, Counter>();

  return (request, response, next) => {
    if (env.NODE_ENV === "test") {
      next();
      return;
    }

    const now = Date.now();
    const key = `${scope}:${request.ip || request.socket.remoteAddress || "unknown"}`;
    const existing = counters.get(key);
    const counter =
      existing && existing.resetsAt > now
        ? existing
        : { count: 0, resetsAt: now + windowMs };

    counter.count += 1;
    counters.set(key, counter);

    response.setHeader("RateLimit-Limit", limit);
    response.setHeader("RateLimit-Remaining", Math.max(0, limit - counter.count));
    response.setHeader("RateLimit-Reset", Math.ceil(counter.resetsAt / 1000));

    if (counter.count > limit) {
      response.status(429).json({
        status: "error",
        message: "Too many requests. Try again after the rate-limit window resets."
      });
      return;
    }

    next();
  };
}
