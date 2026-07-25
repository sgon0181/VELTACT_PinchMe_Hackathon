import cors from "cors";
import express from "express";
import type { Request } from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./env.js";
import { aiIntakeRouter } from "./aiIntake/aiIntakeRoutes.js";
import { marketplaceRouter } from "./marketplace/marketplaceRoutes.js";
import { pinchRouter } from "./pinch/pinchRoutes.js";

export const app = express();
const buyerPublicPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../buyer/public"
);

app.use(
  cors({
    origin: env.WEB_ORIGIN
  })
);
app.use(
  express.json({
    limit: "12mb",
    verify: (request, _response, buffer) => {
      (request as Request).rawBody = buffer;
    }
  })
);

app.get("/api/health", (_request, response) => {
  response.json({
    application: "veltact-api",
    status: "ok",
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

app.use("/api/pinch", pinchRouter);
app.use("/api/ai-intake", aiIntakeRouter);
app.use("/api", marketplaceRouter);

app.get("/", (_request, response) => {
  response.sendFile(path.join(buyerPublicPath, "landing.html"));
});
app.use(express.static(buyerPublicPath, { index: false }));
