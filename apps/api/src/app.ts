import cors from "cors";
import express from "express";
import { env } from "./env.js";
import { pinchRouter } from "./pinch/pinchRoutes.js";

export const app = express();

app.use(
  cors({
    origin: env.WEB_ORIGIN
  })
);
app.use(express.json());

app.get("/api/health", (_request, response) => {
  response.json({
    application: "veltact-api",
    status: "ok",
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

app.use("/api/pinch", pinchRouter);
