import "dotenv/config";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import { createServer } from "http";
import { serveStatic, setupVite } from "./vite";
import { registerLocalApi } from "./localApi";
import { applySecurityHeaders } from "./security";

function configuredPort(): number {
  const rawPort = process.env.PORT ?? "3000";
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`PORT must be an integer between 1 and 65535; received ${rawPort}`);
  }
  return port;
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.use((_req, res, next) => {
    applySecurityHeaders(res);
    next();
  });
  app.use(express.json({ limit: "256kb", strict: true }));
  app.use(express.urlencoded({ limit: "32kb", extended: false }));

  // Keep parser failures inside the API's privacy-safe error boundary.
  // Express/body-parser errors can otherwise expose implementation details.
  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    const parserError = error as { type?: string };
    if (parserError.type === "entity.too.large") {
      return res.status(413).json({ error: "Request is too large." });
    }
    if (parserError.type === "entity.parse.failed") {
      return res.status(400).json({ error: "Malformed request body." });
    }
    return next(error);
  });

  registerLocalApi(app);
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Final privacy-safe boundary for unexpected application errors.
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (res.headersSent) return;
    res.status(500).json({ error: "Unable to process the request. Please try again." });
  });

  const port = configuredPort();
  const host = process.env.HOST?.trim() || "127.0.0.1";
  await new Promise<void>((resolve, reject) => {
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") reject(new Error(`Port ${port} is unavailable. Set PORT to an available configured port; Byte Drop will not switch ports automatically.`));
      else reject(error);
    });
    server.listen(port, host, () => {
      console.log(`Server running on http://${host}:${port}/`);
      resolve();
    });
  });
}

startServer().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Server failed to start");
  process.exitCode = 1;
});
